import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, delimiter } from "node:path";
import { getApps, getAppDescriptor, resolveHome } from "@core/index.js";
import type { AppDescriptor } from "@core/index.js";
import { getPlugins } from "@plugin-updater/config.js";
import type { Plugin } from "@plugin-updater/types.js";
import { resolveModelMap } from "@core-proxy/model-map.js";
import { normalizeQuotas } from "../../../vendor/usage/snapshot.js";
import { appRealHome } from "../lib/pluginHomes.js";
import { svgIconDataUri } from "../lib/pluginIcon.js";
import { scanOrg } from "../lib/orgScan.js";
import { profileFor } from "../lib/proxyRegistry.js";
import type { AppAccountSummary, AppConnection, AppPresence, AppProviderAgg, AppSummary, CliResult, HostApp, Result } from "../../../packages/shared/src/domain.js";
import { wrap, err } from "../result.js";

export type BinaryExistsFn = (name: string) => boolean;
export type FsExistsFn = (path: string) => boolean;
export type SpawnFn = (file: string, args: string[]) => Promise<CliResult>;

function realBinaryExists(name: string): boolean {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  return pathEnv.split(delimiter).some((dir) => exts.some((ext) => existsSync(join(dir, name + ext))));
}

// On Windows, npm/npx are shell shims (npm.cmd/npx.cmd); execFile needs the .cmd
// suffix to find them without shelling out to a command string.
function resolveExecutable(file: string): string {
  return process.platform === "win32" ? `${file}.cmd` : file;
}

function realSpawn(file: string, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    execFile(resolveExecutable(file), args, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
}

function isPresent(desc: AppDescriptor, binaryExists: BinaryExistsFn, fsExists: FsExistsFn): boolean {
  return binaryExists(desc.detect.binary) || fsExists(resolveHome(desc));
}

export interface AppsDetectDeps {
  binaryExists?: BinaryExistsFn;
  fsExists?: FsExistsFn;
}

export function appsDetect(deps: AppsDetectDeps = {}): Promise<Result<AppPresence>> {
  const binaryExists = deps.binaryExists ?? realBinaryExists;
  const fsExists = deps.fsExists ?? existsSync;
  return wrap(() => {
    const out: AppPresence = {};
    for (const desc of getApps()) out[desc.id] = isPresent(desc, binaryExists, fsExists);
    return out;
  });
}

// An app's mark is its loader's brand, sourced from the loader repo's cairn.json
// (via the org-scan catalog), never hardcoded. Best-effort: a failed scan just
// yields no loader icons, so apps fall back to a lettermark.
async function loaderIconMap(): Promise<Record<string, string>> {
  try {
    const catalog = await scanOrg();
    const out: Record<string, string> = {};
    for (const e of catalog.entries) if (e.icon) out[e.name] = e.icon;
    return out;
  } catch {
    return {};
  }
}

export function appsList(): Promise<Result<HostApp[]>> {
  return wrap(async () => {
    const loaderIcons = await loaderIconMap();
    return getApps().map((desc) => ({
      id: desc.id,
      label: desc.label,
      // Prefer the loader's mark; a custom app may still carry its own inline SVG.
      icon: (desc.loader ? loaderIcons[desc.loader.id] : undefined) ?? (desc.icon ? svgIconDataUri(desc.icon) : undefined),
    }));
  });
}

export function appsInstallCli(app: string, spawn: SpawnFn = realSpawn): Promise<Result<CliResult>> {
  const desc = getAppDescriptor(app);
  if (!desc) return Promise.resolve(err(`unknown app: ${app}`));
  return wrap(() => spawn("npm", ["install", "-g", desc.detect.pkg]));
}

export function appsInit(app: string, spawn: SpawnFn = realSpawn): Promise<Result<CliResult>> {
  const desc = getAppDescriptor(app);
  if (!desc) return Promise.resolve(err(`unknown app: ${app}`));
  return wrap(() => spawn("npx", ["plugin-updater", "init", "--app", desc.id]));
}

export interface AppsConnectionDeps {
  detect?: () => Promise<Result<AppPresence>>;
  listPlugins?: (dir: string) => Plugin[];
  appHome?: (app: string) => string;
  getDescriptor?: (app: string) => AppDescriptor | undefined;
}

export function appsConnection(app: string, deps: AppsConnectionDeps = {}): Promise<Result<AppConnection>> {
  const detect = deps.detect ?? appsDetect;
  const listPlugins = deps.listPlugins ?? getPlugins;
  const appHome = deps.appHome ?? appRealHome;
  const getDescriptor = deps.getDescriptor ?? getAppDescriptor;
  return wrap(async () => {
    const desc = getDescriptor(app);
    if (!desc) throw new Error(`unknown app: ${app}`);
    const presence = await detect();
    const cliPresent = presence.ok ? !!presence.data[app] : false;
    const loader = desc.loader ?? null;
    const loaderInstalled = loader ? listPlugins(appHome(app)).some((p) => p.name === loader.id) : false;
    return { app, cliPresent, loaderId: loader?.id ?? null, loaderUrl: loader?.url ?? null, loaderInstalled };
  });
}

export interface AppsInstallLoaderDeps {
  getDescriptor?: (app: string) => AppDescriptor | undefined;
  install?: (homeId: string, name: string, url: string) => Promise<Result<void>>;
}

export function appsInstallLoader(app: string, deps: AppsInstallLoaderDeps = {}): Promise<Result<void>> {
  const getDescriptor = deps.getDescriptor ?? getAppDescriptor;
  return wrap(async () => {
    const desc = getDescriptor(app);
    if (!desc) throw new Error(`unknown app: ${app}`);
    if (!desc.loader) throw new Error(`app has no loader: ${app}`);
    const install = deps.install ?? (await import("./plugins.js")).pluginsInstall;
    const res = await install(app, desc.loader.id, desc.loader.url);
    if (!res.ok) throw new Error(res.error);
  });
}

function safeReadJson(path: string): unknown | null {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function accountLabel(account: Record<string, unknown>, provider: string): string {
  const email = account["email"];
  if (typeof email === "string" && email) return email;
  const username = account["username"];
  if (typeof username === "string" && username) return username;
  const id = account["id"];
  if (typeof id === "string" && id) return id;
  return provider;
}

function accountQuotaPct(account: Record<string, unknown>): number | null {
  const quotas = normalizeQuotas(account);
  const first = Object.values(quotas)[0];
  return first && typeof first.remaining === "number" ? Math.round(first.remaining * 100) : null;
}

function providerBreakdownOf(accounts: AppAccountSummary[]): AppProviderAgg[] {
  const byProvider = new Map<string, AppProviderAgg>();
  for (const account of accounts) {
    const agg = byProvider.get(account.provider) ?? { provider: account.provider, accounts: 0, enabled: 0 };
    agg.accounts += 1;
    if (account.enabled) agg.enabled += 1;
    byProvider.set(account.provider, agg);
  }
  return Array.from(byProvider.values()).sort((a, b) => b.accounts - a.accounts);
}

function quotaMinPctOf(accounts: AppAccountSummary[]): number | null {
  const reported = accounts.map((a) => a.quotaPct).filter((pct): pct is number => pct !== null);
  return reported.length > 0 ? Math.min(...reported) : null;
}

export interface AppsUninstallDeps {
  spawn?: SpawnFn;
  rm?: (path: string) => void;
  appHome?: (app: string) => string;
}

export function appsUninstallCli(app: string, wipeData: boolean, deps: AppsUninstallDeps = {}): Promise<Result<CliResult>> {
  const desc = getAppDescriptor(app);
  if (!desc) return Promise.resolve(err(`unknown app: ${app}`));
  const spawn = deps.spawn ?? realSpawn;
  const rm = deps.rm ?? ((p: string) => rmSync(p, { recursive: true, force: true }));
  const appHome = deps.appHome ?? appRealHome;
  return wrap(async () => {
    const result = await spawn("npm", ["uninstall", "-g", desc.detect.pkg]);
    if (wipeData) rm(appHome(app));
    return result;
  });
}

interface AccountsStoreShape {
  providers?: Record<string, { accounts?: Record<string, unknown>[] }>;
}

export interface AppsSummaryDeps {
  appHome?: (app: string) => string;
  readJson?: (path: string) => unknown | null;
}

export function appsSummary(app: string, deps: AppsSummaryDeps = {}): Promise<Result<AppSummary>> {
  const desc = getAppDescriptor(app);
  if (!desc) return Promise.resolve(err(`unknown app: ${app}`));
  const appHome = deps.appHome ?? appRealHome;
  const readJson = deps.readJson ?? safeReadJson;
  return wrap(async () => {
    const home = appHome(app);
    const store = readJson(join(home, "config", "accounts.json")) as AccountsStoreShape | null;
    const accounts: AppAccountSummary[] = [];
    for (const [provider, pool] of Object.entries(store?.providers ?? {})) {
      for (const account of pool.accounts ?? []) {
        accounts.push({
          provider,
          label: accountLabel(account, provider),
          enabled: account["enabled"] !== false,
          quotaPct: accountQuotaPct(account),
        });
      }
    }
    const pluginCount = getPlugins(home).length;

    let routingSlots: number | null = null;
    const profile = await profileFor(app);
    if (profile) {
      const map = resolveModelMap(home, profile);
      routingSlots = Object.values(map).filter((chain) => chain.length > 0).length;
    }

    const providerBreakdown = providerBreakdownOf(accounts);
    return {
      accounts,
      providerCount: providerBreakdown.length,
      accountsEnabled: accounts.filter((a) => a.enabled).length,
      providerBreakdown,
      quotaMinPct: quotaMinPctOf(accounts),
      configDir: home,
      pluginCount,
      routingSlots,
    };
  });
}
