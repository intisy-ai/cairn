import { exec } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";
import { getAppConfigDir } from "@plugin-updater/env.js";
import type { AppPresence, CliResult, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export type AppName = "claude" | "opencode";

export type BinaryExistsFn = (name: string) => boolean;
export type FsExistsFn = (path: string) => boolean;
export type SpawnFn = (command: string) => Promise<CliResult>;

const CLI_PACKAGES: Record<AppName, string> = {
  claude: "@anthropic-ai/claude-code",
  opencode: "opencode-ai",
};

function realBinaryExists(name: string): boolean {
  const pathEnv = process.env.PATH ?? process.env.Path ?? "";
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  return pathEnv.split(delimiter).some((dir) => exts.some((ext) => existsSync(join(dir, name + ext))));
}

function realSpawn(command: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
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
  return wrap(() => {
    const pkg = CLI_PACKAGES[app];
    if (!pkg) throw new Error(`unknown app: ${app}`);
    return spawn(`npm install -g ${pkg}`);
  });
}

export function appsInit(app: AppName, spawn: SpawnFn = realSpawn): Promise<Result<CliResult>> {
  return wrap(() => spawn(`npx plugin-updater init --app ${app}`));
}
