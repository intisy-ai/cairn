import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getApps, registerApp, resolveHome } from "@core/index.js";
import type { AppDescriptor } from "@core/index.js";
import { scanOrg } from "./orgScan.js";
import type { OrgScanDeps } from "./orgScan.js";
import type { CatalogResult } from "../../../packages/shared/src/domain.js";

export interface AppDiscoveryDeps {
  scanOrgFn?: (deps?: OrgScanDeps) => Promise<CatalogResult>;
  orgScanDeps?: OrgScanDeps;
  exists?: (path: string) => boolean;
  readFile?: (path: string) => string;
  getAppsFn?: () => AppDescriptor[];
  registerAppFn?: (desc: AppDescriptor) => void;
}

function normalizeDescriptor(desc: AppDescriptor): AppDescriptor {
  return {
    id: desc.id,
    label: desc.label,
    icon: desc.icon,
    home: desc.home,
    detect: { binary: desc.detect?.binary ?? desc.id, pkg: desc.detect?.pkg ?? "" },
    loader: desc.loader,
    commandsSubdir: desc.commandsSubdir ?? "commands",
    proxyPort: desc.proxyPort ?? 0,
    integration: desc.integration ?? "env-baseurl",
    // Not core's actual wireFormat default (an arbitrary wire-format id, never
    // hardcoded here): only used so two descriptors missing the field compare equal.
    wireFormat: desc.wireFormat ?? "",
    usage: desc.usage,
  };
}

// Recursively sorts object keys before stringifying, so two descriptors that
// carry the same data in a different key order still compare equal.
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) sorted[k] = (val as Record<string, unknown>)[k];
      return sorted;
    }
    return val;
  });
}

function sameDescriptor(a: AppDescriptor, b: AppDescriptor): boolean {
  return stableStringify(normalizeDescriptor(a)) === stableStringify(normalizeDescriptor(b));
}

// A loader repo's installed clone carries the same cairn.json `app` block as its
// GitHub source, at the same "repos/<loaderId>/cairn.json" path the sidecar
// already reads plugin manifests from (see plugins.ts's readManifest). The app's
// mark is the loader's own icon.svg (a raw square SVG sibling of the manifest);
// attach it so the registry carries the icon offline, with no org-scan or token.
function readInstalledAppBlock(homeDir: string, loaderId: string, exists: (p: string) => boolean, readFile: (p: string) => string): AppDescriptor | undefined {
  const dir = join(homeDir, "repos", loaderId);
  const manifestPath = join(dir, "cairn.json");
  if (!exists(manifestPath)) return undefined;
  try {
    const manifest = JSON.parse(readFile(manifestPath)) as { app?: unknown; icon?: unknown };
    if (!manifest.app || typeof manifest.app !== "object" || Array.isArray(manifest.app)) return undefined;
    const desc = manifest.app as AppDescriptor;
    if (!desc.icon && typeof manifest.icon === "string" && manifest.icon.endsWith(".svg")) {
      const iconPath = join(dir, manifest.icon);
      if (exists(iconPath)) {
        try { desc.icon = readFile(iconPath); } catch { /* leave the icon unset */ }
      }
    }
    return desc;
  } catch {
    // malformed manifest on disk, skip this source
  }
  return undefined;
}

// Populates ~/.config/cairn/apps.json from two best-effort sources: the org-scan
// catalog's loader manifests, and the cairn.json already deployed alongside each
// known app's installed loader (fresher than the remote catalog when present).
// Never throws; each source degrades independently, and an unchanged descriptor
// is never rewritten so steady-state calls touch no disk.
export async function discoverApps(deps: AppDiscoveryDeps = {}): Promise<void> {
  const scan = deps.scanOrgFn ?? scanOrg;
  const exists = deps.exists ?? existsSync;
  const readFile = deps.readFile ?? ((p: string) => readFileSync(p, "utf8"));
  const getAppsFn = deps.getAppsFn ?? getApps;
  const registerAppFn = deps.registerAppFn ?? registerApp;

  const current = getAppsFn();
  const candidates = new Map<string, AppDescriptor>();

  try {
    const catalog = await scan(deps.orgScanDeps);
    for (const entry of catalog.entries) {
      if (entry.kind === "loader" && entry.app) candidates.set(entry.app.id, entry.app);
    }
  } catch {
    // org-scan source unavailable, fall through to the installed-loader source
  }

  // Enrich every loader-bearing descriptor (from the org scan or already known)
  // with its installed clone, which also carries the app's icon offline.
  const withLoader = new Map<string, AppDescriptor>();
  for (const desc of [...current, ...candidates.values()]) if (desc.loader) withLoader.set(desc.id, desc);
  for (const desc of withLoader.values()) {
    try {
      const home = resolveHome(desc);
      const found = readInstalledAppBlock(home, desc.loader!.id, exists, readFile);
      if (found) candidates.set(found.id, found);
    } catch {
      // best-effort per app, never blocks discovery of the others
    }
  }

  for (const desc of candidates.values()) {
    const existing = current.find((a) => a.id === desc.id);
    if (existing && sameDescriptor(existing, desc)) continue;
    try {
      registerAppFn(desc);
    } catch {
      // an invalid candidate descriptor is skipped, not fatal to discovery
    }
  }
}
