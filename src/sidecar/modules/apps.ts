import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { getAppConfigDir } from "@plugin-updater/env.js";
import type { AppPresence, CliResult, Result } from "../../../packages/shared/src/domain.js";
import { wrap, err } from "../result.js";

export type AppName = "claude" | "opencode";

export type BinaryExistsFn = (name: string) => boolean;
export type FsExistsFn = (path: string) => boolean;
export type SpawnFn = (file: string, args: string[]) => Promise<CliResult>;

const APPS = ["claude", "opencode"] as const;

function isAppName(x: unknown): x is AppName {
  return typeof x === "string" && (APPS as readonly string[]).includes(x);
}

const CLI_PACKAGES: Record<AppName, string> = {
  claude: "@anthropic-ai/claude-code",
  opencode: "opencode-ai",
};

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

function isPresent(app: AppName, binaryExists: BinaryExistsFn, fsExists: FsExistsFn): boolean {
  return binaryExists(app) || fsExists(getAppConfigDir(app));
}

export interface AppsDetectDeps {
  binaryExists?: BinaryExistsFn;
  fsExists?: FsExistsFn;
}

export function appsDetect(deps: AppsDetectDeps = {}): Promise<Result<AppPresence>> {
  const binaryExists = deps.binaryExists ?? realBinaryExists;
  const fsExists = deps.fsExists ?? existsSync;
  return wrap(() => ({
    claude: isPresent("claude", binaryExists, fsExists),
    opencode: isPresent("opencode", binaryExists, fsExists),
  }));
}

export function appsInstallCli(app: AppName, spawn: SpawnFn = realSpawn): Promise<Result<CliResult>> {
  if (!isAppName(app)) return Promise.resolve(err(`unknown app: ${app}`));
  return wrap(() => spawn("npm", ["install", "-g", CLI_PACKAGES[app]]));
}

export function appsInit(app: AppName, spawn: SpawnFn = realSpawn): Promise<Result<CliResult>> {
  if (!isAppName(app)) return Promise.resolve(err(`unknown app: ${app}`));
  return wrap(() => spawn("npx", ["plugin-updater", "init", "--app", app]));
}
