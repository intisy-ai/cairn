import { createRequire } from "node:module";
import type { UtilityProcess } from "electron";
import type { Result } from "@dashboard/shared";
import { err } from "../../sidecar/result.js";

// Loaded lazily inside createSupervisor: requiring "electron" at module top
// level throws outside a real Electron process, and this module is imported
// by the buildSidecarEnv unit test under plain Node/vitest.
const require = createRequire(import.meta.url);

export function buildSidecarEnv(base: NodeJS.ProcessEnv, storeDir: string): NodeJS.ProcessEnv {
  return { ...base, HUB_CONFIG_DIR: storeDir };
}

type SidecarResponse = { id: number; result: Result<unknown> };

export interface SupervisorOptions {
  sidecarPath: string;
  storeDir: string;
}

export interface Supervisor {
  rpc(channel: string, args: unknown[]): Promise<Result<unknown>>;
  dispose(): void;
}

export function createSupervisor(opts: SupervisorOptions): Supervisor {
  const { utilityProcess } = require("electron") as typeof import("electron");

  let nextId = 1;
  const pending = new Map<number, (result: Result<unknown>) => void>();

  function handleMessage(message: unknown): void {
    const { id, result } = message as SidecarResponse;
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(result);
  }

  function handleExit(): void {
    for (const resolve of pending.values()) resolve(err("sidecar process exited"));
    pending.clear();
    child = spawn();
  }

  function spawn(): UtilityProcess {
    const proc = utilityProcess.fork(opts.sidecarPath, [], {
      env: buildSidecarEnv(process.env, opts.storeDir),
      stdio: "pipe",
    });
    proc.on("message", handleMessage);
    proc.on("exit", handleExit);
    return proc;
  }

  let child = spawn();

  return {
    rpc(channel, args) {
      return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        child.postMessage({ id, channel, args });
      });
    },
    dispose() {
      child.off("exit", handleExit);
      child.kill();
    },
  };
}
