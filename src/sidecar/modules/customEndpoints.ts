import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { getConfigDir, listAccounts as realListAccounts, addAccount as realAddAccount, removeAccount as realRemoveAccount } from "@core-auth/index.js";
import { pluginByCapability } from "./engines.js";
import type { CustomEndpoint, CustomEndpointView, Result } from "../../../packages/shared/src/domain.js";
import { SUPPORTED_ENDPOINT_FORMATS } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

const ID_RE = /^[A-Za-z0-9._-]+$/;

function engineMeta(): { providerId: string; configName: string } {
  const meta = pluginByCapability("custom-endpoints")?.meta;
  if (!meta?.providerId || !meta?.configName) throw new Error("custom-endpoints engine is not registered");
  return { providerId: meta.providerId, configName: meta.configName };
}

type Account = { enabled?: boolean; meta?: { endpointId?: string } };
export interface CustomEndpointsDeps {
  dir?: string;
  listAccounts?: (provider: string) => Account[];
  addAccount?: (provider: string, account: { id: string; refresh: string; enabled: boolean; meta: { endpointId: string } }) => void;
  removeAccount?: (provider: string, id: string) => void;
}

function configFile(dir: string): string {
  const { configName } = engineMeta();
  const file = join(dir, "config", configName + ".json");
  const base = resolve(dir, "config") + sep;
  if (!resolve(file).startsWith(base)) throw new Error("custom endpoints config path escapes the config directory");
  return file;
}

function readEndpoints(file: string): CustomEndpoint[] {
  if (!existsSync(file)) return [];
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { endpoints?: CustomEndpoint[] };
    return Array.isArray(parsed.endpoints) ? parsed.endpoints : [];
  } catch {
    return [];
  }
}

function writeEndpoints(file: string, endpoints: CustomEndpoint[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  existing.endpoints = endpoints;
  writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
}

function validate(ep: CustomEndpoint): string | null {
  if (!ep.id || !ID_RE.test(ep.id)) return "endpoint id must be non-empty and use only letters, numbers, dot, dash, underscore";
  if (!ep.label) return "label is required";
  if (!ep.baseUrl) return "base URL is required";
  try {
    const u = new URL(ep.baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "base URL must be http or https";
  } catch {
    return "base URL is not a valid URL";
  }
  if (!(SUPPORTED_ENDPOINT_FORMATS as readonly string[]).includes(ep.format)) return "unsupported wire format: " + ep.format;
  if (!Array.isArray(ep.models) || ep.models.length === 0) return "at least one model id is required";
  return null;
}

export function customEndpointsList(deps: CustomEndpointsDeps = {}): Promise<Result<CustomEndpointView[]>> {
  const dir = deps.dir ?? getConfigDir();
  const list = deps.listAccounts ?? ((p) => realListAccounts(p, undefined) as Account[]);
  return wrap(async () => {
    const { providerId } = engineMeta();
    const endpoints = readEndpoints(configFile(dir));
    const keyed = new Set(
      list(providerId)
        .filter((a) => a.enabled !== false && a.meta?.endpointId)
        .map((a) => a.meta!.endpointId as string),
    );
    return endpoints.map((e) => ({ ...e, hasKey: keyed.has(e.id) }));
  });
}

export function customEndpointsUpsert(endpoint: CustomEndpoint, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  const dir = deps.dir ?? getConfigDir();
  return wrap(async () => {
    const problem = validate(endpoint);
    if (problem) throw new Error(problem);
    const file = configFile(dir);
    const endpoints = readEndpoints(file);
    const idx = endpoints.findIndex((e) => e.id === endpoint.id);
    if (idx >= 0) endpoints[idx] = endpoint;
    else endpoints.push(endpoint);
    writeEndpoints(file, endpoints);
  });
}

export function customEndpointsRemove(id: string, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  const dir = deps.dir ?? getConfigDir();
  const remove = deps.removeAccount ?? ((p, i) => realRemoveAccount(p, i, undefined));
  return wrap(async () => {
    const { providerId } = engineMeta();
    const file = configFile(dir);
    writeEndpoints(file, readEndpoints(file).filter((e) => e.id !== id));
    remove(providerId, id);
  });
}

export function customEndpointsSaveKey(endpointId: string, key: string, deps: CustomEndpointsDeps = {}): Promise<Result<void>> {
  const dir = deps.dir ?? getConfigDir();
  const add = deps.addAccount ?? ((p, a) => realAddAccount(p, a, undefined));
  return wrap(async () => {
    const { providerId } = engineMeta();
    if (!endpointId) throw new Error("endpointId is required");
    if (!key) throw new Error("key is required");
    if (!readEndpoints(configFile(dir)).some((e) => e.id === endpointId)) throw new Error("unknown endpoint: " + endpointId);
    add(providerId, { id: endpointId, refresh: key, enabled: true, meta: { endpointId } });
  });
}
