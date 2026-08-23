import {
  CROSS_APP_SYNC,
  LIBRARY_MANAGEMENT,
  PLUGIN_MANAGEMENT,
} from "@core/index.js";
import type {
  CrossAppSyncCapability,
  LibraryManagementCapability,
  ManagedPlugin,
  PluginManagementCapability,
} from "@core/index.js";
import {
  callHostCapability,
  capabilityProviders,
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_INVOKE_TIMEOUT_MS,
} from "./pluginHost.js";

export { DEFAULT_CALL_TIMEOUT_MS, DEFAULT_INVOKE_TIMEOUT_MS };

/**
 * Runs one call against whichever plugin provides a capability in one home.
 *
 * @remarks
 * The answering plugin is never named: this resolves by capability id, so a home served by a
 * different manager is served all the same. The first provider wins, in activation order, because a
 * capability with one meaning cannot be served twice in one home without a host choosing anyway.
 *
 * The fallback is returned whenever the home has no provider, the implementation does not carry the
 * method, or the call fails or overruns. That is the same degradation this dashboard already applies
 * to a home it cannot read: one home's missing manager costs that home's answer, never another's.
 */
async function callCapabilityIn<T, R>(
  homeDir: string,
  appId: string,
  key: { id: string },
  operation: string,
  fallback: R,
  work: (capability: T) => Promise<R>,
  timeoutMs: number,
): Promise<R> {
  const [record] = await capabilityProviders(homeDir, appId, key.id);
  if (!record) return fallback;
  const capability = record.implementation as T;
  const answer = await callHostCapability(record.pluginId, `${key.id}.${operation}`, timeoutMs, async () =>
    work(capability));
  if (answer.ok === false) {
    process.stderr.write(`[plugin-api] ${key.id}.${operation} in ${homeDir} failed: ${answer.error.detail}\n`);
    return fallback;
  }
  return answer.value ?? fallback;
}

/** Whether a home has anything providing a capability at all, which is what gates an offer of it. */
export async function hasCapability(homeDir: string, appId: string, key: { id: string }): Promise<boolean> {
  return (await capabilityProviders(homeDir, appId, key.id)).length > 0;
}

export function readPluginManagement<R>(
  homeDir: string,
  appId: string,
  operation: string,
  fallback: R,
  work: (capability: PluginManagementCapability) => Promise<R>,
): Promise<R> {
  return callCapabilityIn(homeDir, appId, PLUGIN_MANAGEMENT, operation, fallback, work, DEFAULT_CALL_TIMEOUT_MS);
}

/** The invoke budget, not the read one: an install or an update does real work under it. */
export function invokePluginManagement<R>(
  homeDir: string,
  appId: string,
  operation: string,
  fallback: R,
  work: (capability: PluginManagementCapability) => Promise<R>,
): Promise<R> {
  return callCapabilityIn(homeDir, appId, PLUGIN_MANAGEMENT, operation, fallback, work, DEFAULT_INVOKE_TIMEOUT_MS);
}

export function readLibraryManagement<R>(
  homeDir: string,
  appId: string,
  operation: string,
  fallback: R,
  work: (capability: LibraryManagementCapability) => Promise<R>,
): Promise<R> {
  return callCapabilityIn(homeDir, appId, LIBRARY_MANAGEMENT, operation, fallback, work, DEFAULT_CALL_TIMEOUT_MS);
}

export function invokeLibraryManagement<R>(
  homeDir: string,
  appId: string,
  operation: string,
  fallback: R,
  work: (capability: LibraryManagementCapability) => Promise<R>,
): Promise<R> {
  return callCapabilityIn(homeDir, appId, LIBRARY_MANAGEMENT, operation, fallback, work, DEFAULT_INVOKE_TIMEOUT_MS);
}

export function invokeCrossAppSync<R>(
  homeDir: string,
  appId: string,
  fallback: R,
  work: (capability: CrossAppSyncCapability) => Promise<R>,
): Promise<R> {
  return callCapabilityIn(homeDir, appId, CROSS_APP_SYNC, "sync", fallback, work, DEFAULT_INVOKE_TIMEOUT_MS);
}

/**
 * Every plugin one home has registered, or an empty list when nothing manages that home.
 *
 * @remarks
 * Read by nearly every sidecar module, so it lives here rather than being resolved per call site:
 * a home with no manager degrades to "no plugins" once, consistently, instead of each caller
 * inventing the same fallback.
 */
export function listedPlugins(homeDir: string, appId: string): Promise<ManagedPlugin[]> {
  return readPluginManagement(homeDir, appId, "list", [], (capability) => capability.list());
}

export { CROSS_APP_SYNC, LIBRARY_MANAGEMENT, PLUGIN_MANAGEMENT };
