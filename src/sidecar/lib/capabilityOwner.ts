import { readDeployedManifests } from "@core-loader/plugin-manifests.js";
import { pluginDir } from "./storagePaths.js";

/** One plugin deployed in a home, as its manifest sidecar describes it. */
export interface DeployedManifest {
  /** The manifest id, which is also the bundle and sidecar basename. */
  id: string;
  /** Capability ids the manifest declares. */
  capabilities: string[];
  /** Permissions the manifest declares. */
  permissions: string[];
  /** The deployed bundle beside the sidecar, or null when none is deployed. */
  entryPath: string | null;
}

/**
 * Every plugin deployed in one home, ordered by id.
 *
 * @remarks
 * Reads the sidecars deploy writes beside each bundle, so it answers without importing anything and
 * without a running host. An unreadable home is an empty list rather than a throw: Cairn renders
 * several homes at once and one broken home must not blank the others.
 */
export function deployedManifests(homeDir: string): DeployedManifest[] {
  try {
    return readDeployedManifests(pluginDir(homeDir)).loaded.map((plugin) => ({
      id: plugin.manifest.id,
      capabilities: plugin.manifest.capabilities ?? [],
      permissions: plugin.manifest.permissions ?? [],
      entryPath: plugin.entryPath,
    }));
  } catch {
    return [];
  }
}

/** The plugin providing a capability in this home, or null when nothing declares it. */
export function ownerOfCapability(homeDir: string, capabilityId: string): string | null {
  return deployedManifests(homeDir).find((plugin) => plugin.capabilities.includes(capabilityId))?.id ?? null;
}

/** Whether one named plugin declares a capability in this home. */
export function pluginProvidesCapability(homeDir: string, pluginId: string, capabilityId: string): boolean {
  return deployedManifests(homeDir).some((plugin) => plugin.id === pluginId && plugin.capabilities.includes(capabilityId));
}

/** Whether a plugin is deployed in this home at all, whatever a home's plugin list says. */
export function isDeployedPlugin(homeDir: string, pluginId: string): boolean {
  return deployedManifests(homeDir).some((plugin) => plugin.id === pluginId);
}
