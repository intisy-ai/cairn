import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { setConfigValue, resolveLayout } from "@core/index.js";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result, FieldSpec, ActionSpec, SectionSpec, DataSpec } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, homeById } from "../lib/pluginHomes.js";
import { safeGetPlugins, loadPluginUpdaterConfig, loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import { isDeployedPlugin } from "../lib/capabilityOwner.js";
import { probeDeclarations, readCurrentValues } from "../lib/schemaProbe.js";
import type { Bundle, Declaration } from "../lib/schemaProbe.js";
import { capabilityProviders, callHostCapability, DEFAULT_CALL_TIMEOUT_MS, DEFAULT_INVOKE_TIMEOUT_MS } from "../lib/pluginHost.js";
import { wrap } from "../result.js";
import { pluginDir } from "../lib/storagePaths.js";

/** What a plugin's `settings` capability declares about itself, beyond its defaults. */
interface CapabilityDeclaration {
  fields?: FieldSpec[];
  actions?: ActionSpec[];
  sections?: SectionSpec[];
  data?: DataSpec;
}

/** What a plugin providing `settings` answers with. */
interface SettingsCapabilityLike {
  schema: () => CapabilityDeclaration | Promise<CapabilityDeclaration>;
  run: (actionId: string) => Promise<{ ok: boolean; message?: string }>;
}

type SettingsProvider = { pluginId: string; implementation: SettingsCapabilityLike };

async function realSettingsProviders(homeDir: string, appId: string): Promise<SettingsProvider[]> {
  const records = await capabilityProviders(homeDir, appId, "settings");
  return records.map((record) => ({ pluginId: record.pluginId, implementation: record.implementation as SettingsCapabilityLike }));
}

async function realBundles(home: PluginHome): Promise<Bundle[]> {
  return (await safeGetPlugins(home.dir))
    .map((plugin) => ({ plugin: plugin.name, path: join(pluginDir(home.dir), `${plugin.name}.js`) }))
    .filter((bundle) => existsSync(bundle.path));
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
  settingsProviders?: (homeDir: string, appId: string) => Promise<SettingsProvider[]>;
}

/**
 * Resolves a home's plugin declarations, preferring each plugin's `settings` capability where one
 * answers and falling back to the probe for everything else.
 *
 * @remarks
 * A deployed bundle inlines its own copy of core, so `defineConfig`'s defaults live in THAT
 * module instance, unreachable from the capability's answer or from Cairn's own core. The probe
 * runs inside the bundle itself and stays the only source that can read them, so it is kept as a
 * standing `defaults` channel for every plugin, not merely a fallback for one with no capability.
 * `fields`, `actions`, `sections` and `data` come from the capability where it answers, since that
 * is the plugin's own live declaration; `current` always comes from disk, so a write is visible on
 * the very next read with nothing to invalidate.
 */
export function configSchemas(homeId: string, deps: ConfigSchemasDeps = {}): Promise<Result<PluginConfigSchema[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const home = homeById(homeId as PluginHomeId, homes);
    const declare = deps.declarations ?? probeDeclarations;
    const values = deps.values ?? readCurrentValues;
    const settingsProviders = deps.settingsProviders ?? realSettingsProviders;

    const bundles: Bundle[] = await realBundles(home);
    const declared = await declare(bundles);
    const capabilities = await settingsProviders(home.dir, home.id);

    const schemas: PluginConfigSchema[] = [];
    const resolved = new Set<string>();

    for (const { pluginId, implementation } of capabilities) {
      if (resolved.has(pluginId)) continue;
      resolved.add(pluginId);
      const answer = await callHostCapability(pluginId, "settings.schema", DEFAULT_CALL_TIMEOUT_MS, async () => implementation.schema());
      const capabilitySchema = answer.ok ? answer.value : {};
      const schema: PluginConfigSchema = {
        plugin: pluginId,
        defaults: declared.get(pluginId)?.defaults ?? {},
        current: values(home.dir, pluginId),
      };
      if (capabilitySchema.fields) schema.fields = capabilitySchema.fields;
      if (capabilitySchema.actions) schema.actions = capabilitySchema.actions;
      if (capabilitySchema.sections) schema.sections = capabilitySchema.sections;
      if (capabilitySchema.data) schema.data = capabilitySchema.data;
      schemas.push(schema);
    }

    // The probe is the only channel left for a plugin with no `settings` capability: an older
    // bundle that has not been rebuilt, or one whose entry never declares the capability.
    for (const bundle of bundles) {
      if (resolved.has(bundle.plugin)) continue;
      const declaration = declared.get(bundle.plugin);
      if (!declaration) continue;
      resolved.add(bundle.plugin);
      schemas.push({ plugin: bundle.plugin, ...declaration, current: values(home.dir, bundle.plugin) });
    }

    const engineSchemas = deps.engineSchemas ?? realEngineSchemas;
    for (const schema of await engineSchemas(home)) {
      if (resolved.has(schema.plugin)) continue;
      resolved.add(schema.plugin);
      schemas.push(schema);
    }
    // Split every declaration here, once, so the renderer receives sections and leftovers
    // already separated rather than reimplementing core's rule in the browser.
    return schemas.map((schema) => ({ ...schema, layout: resolveLayout(schema.plugin, schema) }));
  });
}

export interface ConfigActionDeps {
  homes?: PluginHome[];
  settingsProviders?: (homeDir: string, appId: string) => Promise<SettingsProvider[]>;
}

// Invoke a plugin's declared action through its `settings` capability. The action id is
// validated against a fresh read of the plugin's own declared actions (authoritative, never
// trusted from the caller) before it runs.
export function configAction(homeId: string, plugin: string, actionId: string, deps: ConfigActionDeps = {}): Promise<Result<{ stdout: string; stderr: string }>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const home = homeById(homeId as PluginHomeId, homes);
    const settingsProviders = deps.settingsProviders ?? realSettingsProviders;
    const provider = (await settingsProviders(home.dir, home.id)).find((p) => p.pluginId === plugin);
    if (!provider) throw new Error(`plugin not found: ${plugin}`);

    const schemaAnswer = await callHostCapability(plugin, "settings.schema", DEFAULT_CALL_TIMEOUT_MS, async () => provider.implementation.schema());
    const declared = schemaAnswer.ok && (schemaAnswer.value.actions?.some((a) => a.id === actionId) ?? false);
    if (!declared) throw new Error(`unknown action: ${actionId}`);

    const runAnswer = await callHostCapability(plugin, "settings.run", DEFAULT_INVOKE_TIMEOUT_MS, async () => provider.implementation.run(actionId));
    if (runAnswer.ok === false) throw new Error(runAnswer.error.detail);
    const outcome = runAnswer.value;
    // A refusal must still fail the Result: a plugin action that quietly reports success while
    // doing nothing is the silent-failure class this seam exists to catch.
    if (!outcome.ok) throw new Error(outcome.message ?? `action failed: ${actionId}`);
    return { stdout: outcome.message ?? "", stderr: "" };
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
    // A plugin can be deployed into a home without a plugins.json entry of its own, so its
    // settings would otherwise be readable and never writable.
    if (!(await safeGetPlugins(dir)).some((p) => p.name === plugin) && !isDeployedPlugin(dir, plugin)) {
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
