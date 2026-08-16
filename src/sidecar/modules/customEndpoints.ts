import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { getConfigDir } from "@core-auth/index.js";
import { pluginOwningCapability } from "./engines.js";
import type { CustomEndpoint, CustomEndpointView, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";
import { importHandlerModule } from "../lib/providerHandler.js";
import { reposDir } from "../lib/storagePaths.js";
import { capabilityProviders, callHostCapability, DEFAULT_CALL_TIMEOUT_MS } from "../lib/pluginHost.js";
import { ownerOfCapability } from "../lib/capabilityOwner.js";

// Custom endpoints are the provider plugin's own data: what makes one valid, where it is
// stored, and what has to happen for it to become routable are all decided there. This module
// only reaches that plugin and passes calls through, so the dashboard and every loader apply
// one rule set rather than each carrying a copy that drifts.
//
// The plugin is located by CAPABILITY, never by name, and loaded from the home it is deployed
// in. Absent plugin means no custom endpoints: there would be nothing to serve them.

export interface CustomEndpointsDeps {
  dir?: string;
  appId?: string;
  loadPlugin?: () => Promise<EndpointsApi | null>;
  capability?: () => Promise<EndpointsCapability | null>;
}

// What the plugin exposes for managing endpoints (see its handler's exports).
export interface EndpointsApi {
  SUPPORTED_FORMATS: readonly string[];
  validateEndpoint: (endpoint: Partial<CustomEndpoint>, opts?: { rejectDuplicate?: boolean }) => string | null;
  // Async because the answer is which translators are installed, not a constant. Older
  // bundles export only the SUPPORTED_FORMATS array, which is then the floor.
  supportedFormats?: (configDir: string) => Promise<string[]>;
  upsertEndpoint: (endpoint: CustomEndpoint, repoDir?: string) => void | Promise<void>;
  removeEndpoint: (id: string, repoDir?: string) => void;
  endpointViews: () => CustomEndpointView[];
  saveKey: (endpointId: string, key: string) => void;
}

export type CustomEndpointSummary = Pick<CustomEndpointView, "id" | "label" | "baseUrl">;

/** What the read-only `custom-endpoints` capability answers with. */
export interface EndpointsCapability {
  endpoints: () => Promise<CustomEndpointSummary[]>;
}

// The read path is the capability's; the write path stays on the plugin's named handler exports,
// which is the same seam every loader uses and the one place endpoint validation lives.
async function realCapability(dir: string, appId: string): Promise<EndpointsCapability | null> {
  const providers = await capabilityProviders(dir, appId, "custom-endpoints");
  const found = providers[0];
  return found ? (found.implementation as EndpointsCapability) : null;
}

function repoDir(dir: string): string {
  const plugin = pluginOwningCapability("custom-endpoints", dir);
  if (!plugin) throw new Error("no plugin provides custom endpoints");
  return join(reposDir(dir), plugin);
}

async function realLoadPlugin(dir: string): Promise<EndpointsApi | null> {
  const repo = repoDir(dir);
  const handler = join(repo, "dist", "handler.js");
  if (!existsSync(handler)) return null;
  const loaded = (await importHandlerModule(handler, basename(repo))) as Partial<EndpointsApi>;
  return typeof loaded.upsertEndpoint === "function" ? (loaded as EndpointsApi) : null;
}

async function api(deps: CustomEndpointsDeps): Promise<{ plugin: EndpointsApi; repo: string }> {
  const dir = deps.dir ?? getConfigDir();
  const plugin = deps.loadPlugin ? await deps.loadPlugin() : await realLoadPlugin(dir);
  if (!plugin) throw new Error("custom endpoints need their provider plugin installed");
  return { plugin, repo: repoDir(dir) };
}

export function customEndpointsFormats(deps: CustomEndpointsDeps = {}): Promise<Result<string[]>> {
  return wrap(async () => {
    const { plugin } = await api(deps);
    const dir = deps.dir ?? getConfigDir();
    return plugin.supportedFormats ? await plugin.supportedFormats(dir) : [...plugin.SUPPORTED_FORMATS];
  });
}

export function customEndpointsList(deps: CustomEndpointsDeps = {}): Promise<Result<CustomEndpointSummary[]>> {
  return wrap(async () => {
    const dir = deps.dir ?? getConfigDir();
    const appId = deps.appId ?? "cairn";
    const capability = deps.capability ? await deps.capability() : await realCapability(dir, appId);
    if (!capability) return [];
    const owner = ownerOfCapability(dir, "custom-endpoints") ?? "custom-endpoints";
    const answer = await callHostCapability(owner, "custom-endpoints.endpoints", DEFAULT_CALL_TIMEOUT_MS, async () => capability.endpoints());
    return answer.ok ? answer.value : [];
  });
}

// The capability's endpoints() answers only {id, label, baseUrl}; the dashboard's endpoints
// dialog also needs format, models and whether a key is set, which only the plugin's own handler
// bundle carries.
export function endpointViews(deps: CustomEndpointsDeps = {}): Promise<Result<CustomEndpointView[]>> {
  return wrap(async () => (await api(deps)).plugin.endpointViews());
}

export function customEndpointsUpsert(endpoint: CustomEndpoint, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const { plugin, repo } = await api(deps);
    await plugin.upsertEndpoint(endpoint, repo);
  });
}

export function customEndpointsRemove(id: string, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const { plugin, repo } = await api(deps);
    plugin.removeEndpoint(id, repo);
  });
}

export function customEndpointsSaveKey(endpointId: string, key: string, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const { plugin } = await api(deps);
    if (!endpointId) throw new Error("endpointId is required");
    if (!key) throw new Error("key is required");
    plugin.saveKey(endpointId, key);
  });
}
