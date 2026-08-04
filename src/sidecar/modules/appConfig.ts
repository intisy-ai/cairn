import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { safeGetPlugins, loadPluginUpdaterConfig } from "../lib/optionalEngines.js";
import { wrap } from "../result.js";

type ProbeFn = (bundlePath: string) => Promise<PluginConfigSchema | null>;

// A plugin built on core answers `node <bundle> config schema` with {name, defaults, current};
// anything else (no bundle, non-zero exit, unparseable stdout) means skip that plugin.
function realProbe(bundlePath: string): Promise<PluginConfigSchema | null> {
  return new Promise((resolve) => {
    execFile("node", [bundlePath, "config", "schema"], { timeout: 10000 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const data = JSON.parse(stdout.trim()) as { name?: unknown; defaults?: unknown; current?: unknown; fields?: unknown; actions?: unknown };
        if (typeof data.name !== "string") { resolve(null); return; }
        const schema: PluginConfigSchema = {
          plugin: data.name,
          defaults: (data.defaults ?? {}) as Record<string, unknown>,
          current: (data.current ?? {}) as Record<string, unknown>,
        };
        if (Array.isArray(data.fields)) schema.fields = data.fields as PluginConfigSchema["fields"];
        if (Array.isArray(data.actions)) schema.actions = data.actions as PluginConfigSchema["actions"];
        resolve(schema);
      } catch {
        resolve(null);
      }
    });
  });
}

export interface ConfigSchemasDeps {
  homes?: PluginHome[];
  probe?: ProbeFn;
}

export function configSchemas(homeId: string, deps: ConfigSchemasDeps = {}): Promise<Result<PluginConfigSchema[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    const probe = deps.probe ?? realProbe;
    const schemas: PluginConfigSchema[] = [];
    for (const plugin of await safeGetPlugins(dir)) {
      const bundlePath = join(dir, "plugin", `${plugin.name}.js`);
      if (!existsSync(bundlePath)) continue;
      const schema = await probe(bundlePath);
      if (schema) schemas.push(schema);
    }
    return schemas;
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
    const bundlePath = join(dir, "plugin", `${plugin}.js`);
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
    if (!(await safeGetPlugins(dir)).some((p) => p.name === plugin)) {
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
    const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
    existing[key] = value;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
  });
}
