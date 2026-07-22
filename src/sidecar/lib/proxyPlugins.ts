import { statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getConfigDir } from "@core-auth/index.js";
import { getPlugins } from "@plugin-updater/config.js";
import type { RoutingProfile } from "@core-proxy/index.js";

export type LoadedProxyDef = { app: "claude" | "opencode"; label: string; profile: () => RoutingProfile };

function isProxyDef(x: unknown): x is LoadedProxyDef {
  const d = x as LoadedProxyDef | undefined;
  return !!d && (d.app === "claude" || d.app === "opencode") && typeof d.label === "string" && typeof d.profile === "function";
}

const cache = new Map<string, { mtimeMs: number; def: LoadedProxyDef | null }>();
export function resetProxyDefCacheForTests(): void {
  cache.clear();
}

export interface ProxyPluginsDeps {
  importFn?: (url: string) => Promise<unknown>;
}

export async function loadInstalledProxyDefs(storeDir: string = getConfigDir(), deps: ProxyPluginsDeps = {}): Promise<LoadedProxyDef[]> {
  const importFn = deps.importFn ?? ((url: string) => import(/* @vite-ignore */ url));
  const defs: LoadedProxyDef[] = [];
  for (const plugin of getPlugins(storeDir)) {
    if (!plugin.name.endsWith("-proxy")) continue;
    const distPath = join(storeDir, "repos", plugin.name, "dist", "index.js");
    let mtimeMs: number;
    try {
      mtimeMs = statSync(distPath).mtimeMs;
    } catch {
      continue;
    }
    const cached = cache.get(distPath);
    if (cached && cached.mtimeMs === mtimeMs) {
      if (cached.def) defs.push(cached.def);
      continue;
    }
    let def: LoadedProxyDef | null = null;
    try {
      const mod = (await importFn(pathToFileURL(distPath).href)) as { proxyDef?: unknown };
      if (isProxyDef(mod.proxyDef)) def = mod.proxyDef;
    } catch {
      def = null;
    }
    cache.set(distPath, { mtimeMs, def });
    if (def) defs.push(def);
  }
  return defs;
}
