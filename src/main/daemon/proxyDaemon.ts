import { homedir } from "node:os";
import { startLoaderProxy } from "@core-loader/proxy-runner.js";
import type { StartLoaderProxyOptions, StartedLoaderProxy } from "@core-loader/proxy-runner.js";
import { createProxyServer, makeDynamicResolver } from "@core-proxy/index.js";
import type { RoutingProfile } from "@core-proxy/index.js";
import { loadInstalledProxyDefs } from "../../sidecar/lib/proxyPlugins.js";
import type { LoadedProxyDef } from "../../sidecar/lib/proxyPlugins.js";
import type { ProxyStatus } from "../../../packages/shared/src/domain.js";
import { resolveStoreDir } from "../lib/storeDir.js";

const PORT = 34567;
const PROBE_TIMEOUT_MS = 500;

type Starter = (options: StartLoaderProxyOptions<RoutingProfile>) => Promise<StartedLoaderProxy>;

let handle: StartedLoaderProxy | null = null;
let startingPromise: Promise<void> | null = null;
let stoppingPromise: Promise<void> | null = null;

function dashboardStoreDir(): string {
  return resolveStoreDir(process.env, process.platform, homedir());
}

async function defaultProbe(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveClaudeProfile(deps: { defs?: () => Promise<LoadedProxyDef[]> } = {}): Promise<RoutingProfile> {
  const defs = await (deps.defs ?? (() => loadInstalledProxyDefs(dashboardStoreDir())))();
  const def = defs.find((d) => d.app === "claude");
  if (!def) throw new Error("claude proxy plugin not installed");
  return def.profile();
}

export function buildStartOptions(configDir: string, profile: RoutingProfile): StartLoaderProxyOptions<RoutingProfile> {
  return {
    // core-loader's generic StartLoaderProxyOptions type-erases the handler-resolution
    // pipeline to `unknown` (it never depends on core-proxy's concrete ProxyHandler type,
    // per the core-libs-stay-generic rule); this cast bridges that intentional boundary,
    // the runtime pairing (makeDynamicResolver's output feeding createProxyServer's
    // resolveHandler) is exact since both come from core-proxy itself.
    createProxyServer: createProxyServer as StartLoaderProxyOptions<RoutingProfile>["createProxyServer"],
    makeDynamicResolver,
    profile,
    configDir,
    port: PORT,
  };
}

export function isRunning(probe: () => Promise<boolean> = defaultProbe): Promise<boolean> {
  return probe();
}

export async function status(probe: () => Promise<boolean> = defaultProbe): Promise<ProxyStatus> {
  return { running: await isRunning(probe), port: PORT };
}

export async function start(
  starter: Starter = startLoaderProxy,
  resolveProfile: () => Promise<RoutingProfile> = () => resolveClaudeProfile(),
): Promise<void> {
  if (handle) return;
  if (startingPromise) return startingPromise;
  startingPromise = (async () => {
    const configDir = dashboardStoreDir();
    if (!process.env.HUB_CONFIG_DIR) process.env.HUB_CONFIG_DIR = configDir;
    const profile = await resolveProfile();
    handle = await starter(buildStartOptions(configDir, profile));
  })();
  try {
    await startingPromise;
  } finally {
    startingPromise = null;
  }
}

export async function stop(): Promise<void> {
  if (!handle) return;
  if (stoppingPromise) return stoppingPromise;
  stoppingPromise = (async () => {
    await handle?.server.close?.();
    handle = null;
  })();
  try {
    await stoppingPromise;
  } finally {
    stoppingPromise = null;
  }
}
