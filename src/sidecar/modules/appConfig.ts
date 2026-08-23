import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { setConfigValue, resolveLayout } from "@core/index.js";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result, FieldSpec, ActionSpec, SectionSpec, DataSpec } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, homeById } from "../lib/pluginHomes.js";
import { loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import { hasCapability, listedPlugins, PLUGIN_MANAGEMENT } from "../lib/pluginManager.js";
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
  return (await listedPlugins(home.dir, home.id))
    .map((plugin) => ({ plugin: plugin.id, path: join(pluginDir(home.dir), `${plugin.id}.js`) }))
    .filter((bundle) => existsSync(bundle.path));
}

// The one call here that a capability cannot replace. A manager registered as an app's npm plugin
// has no deployed bundle in that home, so nothing is host-loadable there and no capability answers,
// yet its settings still have to be reachable. Its declaration also carries defaults and current
// values, which a settings capability does not: `CapabilitySchema` has no field for either, and the
// defaults live in the plugin's own process where they were registered.
async function realEngineSchemas(home: PluginHome): Promise<PluginConfigSchema[]> {
  if (!home.hasUpdater) return [];
  const mod = await loadPluginUpdaterIndex();
  if (!mod?.updaterSchema) return [];
  return [mod.updaterSchema(home.dir) as PluginConfigSchema];
}

export interface ConfigSchemasDeps {
  homes?: PluginHome[];
  bundles?: (home: PluginHome) => Promise<Bundle[]>;
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

    const bundles: Bundle[] = await (deps.bundles ?? realBundles)(home);
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
  listPlugins?: (dir: string, appId: string) => Promise<Array<{ id: string }>>;
  managed?: (dir: string, appId: string) => Promise<boolean>;
}

export function configWrite(homeId: string, plugin: string, key: string, value: unknown, deps: ConfigWriteDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    // A plugin can be deployed into a home without a registered entry of its own, so its settings
    // would otherwise be readable and never writable. A home with nothing managing it lists
    // nothing, and the deployed check is then the only thing that can recognise the plugin.
    const listed = deps.listPlugins ?? listedPlugins;
    if (!(await listed(dir, homeId)).some((entry) => entry.id === plugin) && !isDeployedPlugin(dir, plugin)) {
      // A home nothing manages lists nothing, which would otherwise read as "plugin not found" for
      // every plugin including ones that are really there. The two causes need different answers.
      const managed = deps.managed ?? ((home: string, appId: string) => hasCapability(home, appId, PLUGIN_MANAGEMENT));
      if (!(await managed(dir, homeId))) {
        throw new Error(`nothing manages the plugins of ${homeId}`);
      }
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
