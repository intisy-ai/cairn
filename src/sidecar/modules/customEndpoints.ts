import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import { getConfigDir } from "@core-auth/index.js";
import { pluginByCapability } from "./engines.js";
import type { CustomEndpoint, CustomEndpointView, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";
import { importHandlerModule } from "../lib/providerHandler.js";
import { reposDir } from "../lib/storagePaths.js";

// Custom endpoints are the provider plugin's own data: what makes one valid, where it is
// stored, and what has to happen for it to become routable are all decided there. This module
// only reaches that plugin and passes calls through, so the dashboard and every loader apply
// one rule set rather than each carrying a copy that drifts.
//
// The plugin is located by CAPABILITY, never by name, and loaded from the home it is deployed
// in. Absent plugin means no custom endpoints: there would be nothing to serve them.

export interface CustomEndpointsDeps {
  dir?: string;
  loadPlugin?: () => Promise<EndpointsApi | null>;
}

// What the plugin exposes for managing endpoints (see its handler's exports).
export interface EndpointsApi {
  SUPPORTED_FORMATS: readonly string[];
  validateEndpoint: (endpoint: Partial<CustomEndpoint>, opts?: { rejectDuplicate?: boolean }) => string | null;
  upsertEndpoint: (endpoint: CustomEndpoint, repoDir?: string) => void;
  removeEndpoint: (id: string, repoDir?: string) => void;
  endpointViews: () => CustomEndpointView[];
  saveKey: (endpointId: string, key: string) => void;
  writeDynamicManifest: (repoDir?: string) => void;
}

function repoDir(dir: string): string {
  const plugin = pluginByCapability("custom-endpoints");
  if (!plugin) throw new Error("no plugin provides custom endpoints");
  return join(reposDir(dir), plugin.id);
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
  return wrap(async () => [...(await api(deps)).plugin.SUPPORTED_FORMATS]);
}

export function customEndpointsList(deps: CustomEndpointsDeps = {}): Promise<Result<CustomEndpointView[]>> {
  return wrap(async () => (await api(deps)).plugin.endpointViews());
}

export function customEndpointsUpsert(endpoint: CustomEndpoint, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const { plugin, repo } = await api(deps);
    plugin.upsertEndpoint(endpoint, repo);
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
