import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { setConfigValue, isBootstrapPlugin, resolveLayout } from "@core/index.js";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, homeById } from "../lib/pluginHomes.js";
import { safeGetPlugins, loadPluginUpdaterConfig, loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import { probeDeclarations, readCurrentValues } from "../lib/schemaProbe.js";
import type { Bundle, Declaration } from "../lib/schemaProbe.js";
import { wrap } from "../result.js";
import { pluginDir } from "../lib/storagePaths.js";

type ProbeFn = (bundlePath: string) => Promise<PluginConfigSchema | null>;

// A plugin built on core answers `node <bundle> config schema` with {name, defaults, current};
// anything else (no bundle, non-zero exit, unparseable stdout) means skip that plugin.
function realProbe(bundlePath: string): Promise<PluginConfigSchema | null> {
  return new Promise((resolve) => {
    execFile("node", [bundlePath, "config", "schema"], { timeout: 10000 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const data = JSON.parse(stdout.trim()) as { name?: unknown; defaults?: unknown; current?: unknown; fields?: unknown; actions?: unknown; sections?: unknown };
        if (typeof data.name !== "string") { resolve(null); return; }
        const schema: PluginConfigSchema = {
          plugin: data.name,
          defaults: (data.defaults ?? {}) as Record<string, unknown>,
          current: (data.current ?? {}) as Record<string, unknown>,
        };
        if (Array.isArray(data.fields)) schema.fields = data.fields as PluginConfigSchema["fields"];
        if (Array.isArray(data.actions)) schema.actions = data.actions as PluginConfigSchema["actions"];
        if (Array.isArray(data.sections)) schema.sections = data.sections as PluginConfigSchema["sections"];
        resolve(schema);
      } catch {
        resolve(null);
      }
    });
  });
}

// An engine is installed in a home without necessarily having a bundle there to probe: it
// can be registered as an npm plugin, or the home may have nothing deployed yet. It answers
// as a library instead, so its settings stay reachable wherever it is installed.
async function realEngineSchemas(home: PluginHome): Promise<PluginConfigSchema[]> {
  if (!home.hasUpdater) return [];
  const mod = await loadPluginUpdaterIndex();
  if (!mod?.updaterSchema) return [];
  return [mod.updaterSchema(home.dir) as PluginConfigSchema];
}

export interface ConfigSchemasDeps {
  homes?: PluginHome[];
  declarations?: (bundles: Bundle[]) => Promise<Map<string, Declaration>>;
  values?: (dir: string, plugin: string) => Record<string, unknown>;
  engineSchemas?: (home: PluginHome) => Promise<PluginConfigSchema[]>;
}

// Declarations come from the cache whenever a plugin's bundle is unchanged, so opening a
// settings screen normally spawns nothing; values are always read from disk, so a write is
// reflected on the next read with nothing to invalidate.
export function configSchemas(homeId: string, deps: ConfigSchemasDeps = {}): Promise<Result<PluginConfigSchema[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const home = homeById(homeId as PluginHomeId, homes);
    const declare = deps.declarations ?? probeDeclarations;
    const values = deps.values ?? readCurrentValues;

    const bundles: Bundle[] = (await safeGetPlugins(home.dir))
      .map((plugin) => ({ plugin: plugin.name, path: join(pluginDir(home.dir), `${plugin.name}.js`) }))
      .filter((bundle) => existsSync(bundle.path));
    const declared = await declare(bundles);

    const schemas: PluginConfigSchema[] = [];
    for (const bundle of bundles) {
      const declaration = declared.get(bundle.plugin);
      if (!declaration) continue;
      schemas.push({ plugin: bundle.plugin, ...declaration, current: values(home.dir, bundle.plugin) });
    }
    const probed = new Set(schemas.map((s) => s.plugin));
    const engineSchemas = deps.engineSchemas ?? realEngineSchemas;
    for (const schema of await engineSchemas(home)) {
      if (!probed.has(schema.plugin)) schemas.push(schema);
    }
    // Split every declaration here, once, so the renderer receives sections and leftovers
    // already separated rather than reimplementing core's rule in the browser.
    return schemas.map((schema) => ({ ...schema, layout: resolveLayout(schema.plugin, schema) }));
  });
}

export interface ConfigActionDeps {
  homes?: PluginHome[];
  probe?: ProbeFn;
  run?: (bundlePath: string, actionId: string) => Promise<{ stdout: string; stderr: string }>;
}

function realRun(bundlePath: string, actionId: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("node", [bundlePath, actionId], { timeout: 600000 }, (error, stdout, stderr) => {
      if (error && (error as NodeJS.ErrnoException).code !== undefined && typeof error.code === "number") {
        reject(new Error(stderr.trim() || `action exited with code ${error.code}`));
        return;
      }
      if (error) { reject(error); return; }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

// Invoke a plugin's declared action. The action id is validated against a fresh
// probe of the plugin's own declared actions (authoritative), never trusted from
// the caller, before the bundle is executed.
export function configAction(homeId: string, plugin: string, actionId: string, deps: ConfigActionDeps = {}): Promise<Result<{ stdout: string; stderr: string }>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    if (!(await safeGetPlugins(dir)).some((p) => p.name === plugin)) {
      throw new Error(`plugin not found: ${plugin}`);
    }
    const bundlePath = join(pluginDir(dir), `${plugin}.js`);
    if (!existsSync(bundlePath)) throw new Error(`plugin bundle not found: ${plugin}`);
    const probe = deps.probe ?? realProbe;
    const schema = await probe(bundlePath);
    const declared = schema?.actions?.some((a) => a.id === actionId) ?? false;
    if (!declared) throw new Error(`unknown action: ${actionId}`);
    const run = deps.run ?? realRun;
    return run(bundlePath, actionId);
  });
}

export interface ConfigWriteDeps {
  homes?: PluginHome[];
}

export function configWrite(homeId: string, plugin: string, key: string, value: unknown, deps: ConfigWriteDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    // safeGetPlugins degrades to [] when plugin-updater is unavailable, which would otherwise
    // read as "plugin not found" even when the named plugin is actually registered.
    if (!(await loadPluginUpdaterConfig())) throw new Error("plugin-updater is not available in this build");
    // An engine settles into a home without a plugins.json entry of its own, so its own
    // settings would otherwise be readable and never writable.
    if (!(await safeGetPlugins(dir)).some((p) => p.name === plugin) && !isBootstrapPlugin(plugin)) {
      throw new Error(`plugin not found: ${plugin}`);
    }
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(`invalid config key: ${key}`);
    }
    const file = join(dir, "config", `${plugin}.json`);
    const base = resolve(dir, "config");
    if (!resolve(file).startsWith(base + sep)) {
      throw new Error(`invalid config target: ${plugin}`);
    }
    // core owns config writing (it is the only writer, and it records the change with
    // the before/after values redacted); the guards above still describe the target it
    // computes, which is this same <dir>/config/<plugin>.json.
    setConfigValue(plugin, key, value, dir);
  });
}
