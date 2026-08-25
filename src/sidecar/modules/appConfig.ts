import { join, resolve, sep } from "node:path";
import { setConfigValue, resolveLayout, SETTINGS } from "@intisy-ai/core";
import type { ManagedNpmPlugin } from "@intisy-ai/core";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result, FieldSpec, ActionSpec, SectionSpec, DataSpec } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir, homeById } from "../lib/pluginHomes.js";
import { hasCapability, listedPlugins, readPluginManagement, PLUGIN_MANAGEMENT } from "../lib/pluginManager.js";
import { deployedManifests, isDeployedPlugin, npmPackageManifest } from "../lib/capabilityOwner.js";
import type { DeployedManifest } from "../lib/capabilityOwner.js";
import { readCurrentValues } from "../lib/configValues.js";
import { capabilityProviders, callHostCapability, DEFAULT_CALL_TIMEOUT_MS, DEFAULT_INVOKE_TIMEOUT_MS } from "../lib/pluginHost.js";
import { wrap } from "../result.js";

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
  const records = await capabilityProviders(homeDir, appId, SETTINGS.id);
  return records.map((record) => ({ pluginId: record.pluginId, implementation: record.implementation as SettingsCapabilityLike }));
}

/**
 * Every manifest a home holds: the sidecars its deploys wrote, plus the package manifest of each
 * npm plugin its manager resolved.
 *
 * @remarks
 * An npm plugin deploys no bundle and writes no sidecar, and where its package resolves is the
 * manager's knowledge rather than a surface's. Deployed sidecars come first so a plugin present
 * both ways is read as the copy this home actually deploys.
 */
async function realManifests(home: PluginHome): Promise<DeployedManifest[]> {
  const deployed = deployedManifests(home.dir);
  const seen = new Set(deployed.map((plugin) => plugin.id));
  const fromNpm = (await readPluginManagement(home.dir, home.id, "listNpm", [] as ManagedNpmPlugin[],
    (capability) => capability.listNpm()))
    .flatMap((plugin) => (plugin.entryPath ? [npmPackageManifest(plugin.entryPath)] : []))
    .filter((manifest): manifest is DeployedManifest => manifest !== null && !seen.has(manifest.id));
  return [...deployed, ...fromNpm];
}

export interface ConfigSchemasDeps {
  homes?: PluginHome[];
  manifests?: (home: PluginHome) => Promise<DeployedManifest[]>;
  values?: (dir: string, plugin: string) => Record<string, unknown>;
  settingsProviders?: (homeDir: string, appId: string) => Promise<SettingsProvider[]>;
}

/**
 * Resolves a home's plugin declarations from the manifests it holds, asking each plugin's
 * `settings` capability for what a manifest cannot state.
 *
 * @remarks
 * `defaults` come from the manifest, which states them as data and costs nothing to read: nothing
 * is spawned and a plugin that cannot even be built still has readable settings. `fields`,
 * `actions`, `sections` and `data` come from the capability where it answers, since those are the
 * plugin's own live declaration; `current` always comes from disk, so a write is visible on the
 * very next read with nothing to invalidate.
 */
export function configSchemas(homeId: string, deps: ConfigSchemasDeps = {}): Promise<Result<PluginConfigSchema[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const home = homeById(homeId as PluginHomeId, homes);
    const values = deps.values ?? readCurrentValues;
    const settingsProviders = deps.settingsProviders ?? realSettingsProviders;

    const manifests = await (deps.manifests ?? realManifests)(home);
    const declaredDefaults = new Map(manifests.flatMap((plugin) => (plugin.configDefaults ? [[plugin.id, plugin.configDefaults] as const] : [])));
    // A plugin whose settings file predates its repository name reads a file its id does not
    // spell, and a surface that guesses the id writes where that plugin never looks.
    const configNames = new Map(manifests.map((plugin) => [plugin.id, plugin.configName]));
    const valuesOf = (plugin: string): Record<string, unknown> => values(home.dir, configNames.get(plugin) ?? plugin);

    const capabilities = await settingsProviders(home.dir, home.id);
    const defaultsFor = (plugin: string): Record<string, unknown> => declaredDefaults.get(plugin) ?? {};

    const schemas: PluginConfigSchema[] = [];
    const resolved = new Set<string>();
    // What each plugin declares it provides, so a surface with a screen for a capability finds the
    // plugin behind it without knowing its name.
    const declaredBy = new Map(manifests.map((plugin) => [plugin.id, plugin.capabilities]));

    for (const { pluginId, implementation } of capabilities) {
      if (resolved.has(pluginId)) continue;
      resolved.add(pluginId);
      const answer = await callHostCapability(pluginId, "settings.schema", DEFAULT_CALL_TIMEOUT_MS, async () => implementation.schema());
      const capabilitySchema = answer.ok ? answer.value : {};
      const schema: PluginConfigSchema = {
        plugin: pluginId,
        defaults: defaultsFor(pluginId),
        current: valuesOf(pluginId),
      };
      if (capabilitySchema.fields) schema.fields = capabilitySchema.fields;
      if (capabilitySchema.actions) schema.actions = capabilitySchema.actions;
      if (capabilitySchema.sections) schema.sections = capabilitySchema.sections;
      if (capabilitySchema.data) schema.data = capabilitySchema.data;
      schemas.push(schema);
    }

    // A plugin with no `settings` capability still has settings to show, because its manifest
    // states them. A manifest is enough on its own, so a plugin deployed into a home that lists no
    // entry for it is reached here rather than being invisible to a screen that can still write to
    // it.
    for (const [plugin, defaults] of declaredDefaults) {
      if (resolved.has(plugin)) continue;
      resolved.add(plugin);
      schemas.push({ plugin, defaults, current: valuesOf(plugin) });
    }

    // Split every declaration here, once, so the renderer receives sections and leftovers
    // already separated rather than reimplementing core's rule in the browser.
    return schemas.map((schema) => ({
      ...schema,
      capabilities: declaredBy.get(schema.plugin) ?? [],
      layout: resolveLayout(schema.plugin, schema),
    }));
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
  manifests?: (homeDir: string) => DeployedManifest[];
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
    // The file the plugin itself reads, which its manifest names when that is not its id. Writing
    // to the id instead leaves the plugin reading a file nothing ever changed.
    const target = (deps.manifests ?? deployedManifests)(dir).find((deployed) => deployed.id === plugin)?.configName ?? plugin;
    const file = join(dir, "config", `${target}.json`);
    const base = resolve(dir, "config");
    if (!resolve(file).startsWith(base + sep)) {
      throw new Error(`invalid config target: ${plugin}`);
    }
    // core owns config writing (it is the only writer, and it records the change with
    // the before/after values redacted); the guards above still describe the target it
    // computes, which is this same <dir>/config/<target>.json.
    setConfigValue(target, key, value, dir);
  });
}
