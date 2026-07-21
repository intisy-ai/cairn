import { homedir } from "node:os";
import { startLoaderProxy } from "@core-loader/proxy-runner.js";
import type { StartLoaderProxyOptions, StartedLoaderProxy } from "@core-loader/proxy-runner.js";
import { createProxyServer, makeDynamicResolver } from "@core-proxy/index.js";
import type { RoutingProfile } from "@core-proxy/index.js";
import { anthropicProfile } from "@claude-code-proxy/index.js";
import type { ProxyStatus } from "../../../packages/shared/src/domain.js";
import { resolveStoreDir } from "../lib/storeDir.js";

const PORT = 34567;
const PROBE_TIMEOUT_MS = 500;

let handle: StartedLoaderProxy | null = null;

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

export function buildStartOptions(configDir: string): StartLoaderProxyOptions<RoutingProfile> {
  return {
    // core-loader's generic StartLoaderProxyOptions type-erases the handler-resolution
    // pipeline to `unknown` (it never depends on core-proxy's concrete ProxyHandler type,
    // per the core-libs-stay-generic rule); this cast bridges that intentional boundary,
    // the runtime pairing (makeDynamicResolver's output feeding createProxyServer's
    // resolveHandler) is exact since both come from core-proxy itself.
    createProxyServer: createProxyServer as StartLoaderProxyOptions<RoutingProfile>["createProxyServer"],
    makeDynamicResolver,
    profile: anthropicProfile(),
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

export async function start(): Promise<void> {
  if (handle) return;
  const configDir = dashboardStoreDir();
  if (!process.env.HUB_CONFIG_DIR) process.env.HUB_CONFIG_DIR = configDir;
  handle = await startLoaderProxy(buildStartOptions(configDir));
}

export async function stop(): Promise<void> {
  if (!handle) return;
  await handle.server.close?.();
  handle = null;
}
