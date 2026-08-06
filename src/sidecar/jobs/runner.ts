import { fork } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { activityEnv } from "@core/index.js";
import { newJob, nextRunnable, applyEvent, cancelJob, isEnded } from "./model.js";
import type { Job, JobSpec, Rollback } from "./model.js";
import { safeGetPlugins, loadPluginUpdaterIndex } from "../lib/optionalEngines.js";

// What the worker is told to do. Mirrors src/installer/index.ts's JobMessage.
export interface JobMessage extends JobSpec {
  jobId: string;
  homeDir: string;
  isPluginManager: boolean;
  autoUpdate: boolean;
}

export interface WorkerHandle {
  onMessage(fn: (message: unknown) => void): void;
  onExit(fn: (code: number | null) => void): void;
  kill(): void;
}

export interface RunnerDeps {
  spawnWorker?: (job: Job, message: JobMessage) => WorkerHandle;
  now?: () => number;
  newId?: () => string;
  onChange?: (job: Job) => void;
  resolveHome?: (homeId: string) => { dir: string };
  isPluginManager?: (plugin: string) => boolean;
  autoUpdate?: () => boolean;
  rollbackClone?: (homeDir: string, plugin: string) => void;
}

export interface Runner {
  enqueue(spec: JobSpec): Job;
  list(): Job[];
  cancel(id: string): boolean;
  clearFinished(): void;
}

// The worker is a sibling bundle of this one, so it sits beside the sidecar's own entry.
function workerPath(): string {
  return join(fileURLToPath(new URL(".", import.meta.url)), "..", "installer.js");
}

// Electron's process.execPath is Electron, not node, and a forked child inherits the
// parent's execArgv. Both have to be stated or the worker never boots in the packaged app.
function realSpawn(_job: Job, message: JobMessage): WorkerHandle {
  const child = fork(workerPath(), {
    execArgv: [],
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    env: { ...process.env, ...activityEnv(), ELECTRON_RUN_AS_NODE: "1", CORE_APP: message.home },
  });
  // Nobody drains these pipes, so a chatty child would eventually wedge on a full buffer.
  child.stdout?.resume();
  child.stderr?.resume();
  child.send(message);
  return {
    onMessage: (fn) => child.on("message", fn),
    onExit: (fn) => child.on("exit", (code) => fn(code)),
    kill: () => child.kill(),
  };
}

// A fresh install can be cancelled before it was ever registered, so removing the entry is
// conditional: plugin-updater's uninstall throws when there is nothing registered, and it is
// what prunes the clone and the deployed bundle when there is.
async function realRollbackClone(homeDir: string, plugin: string): Promise<void> {
  if ((await safeGetPlugins(homeDir)).some((p) => p.name === plugin)) {
    const mod = await loadPluginUpdaterIndex();
    if (mod) { mod.uninstallPlugin(homeDir, plugin); return; }
  }
  for (const path of [join(homeDir, "repos", plugin), join(homeDir, "plugin", `${plugin}.js`), join(homeDir, "plugin", `${plugin}.sha`)]) {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }
}

export function createRunner(deps: RunnerDeps = {}): Runner {
  const spawnWorker = deps.spawnWorker ?? realSpawn;
  const now = deps.now ?? (() => Date.now());
  const onChange = deps.onChange ?? (() => {});
  const resolveHome = deps.resolveHome ?? ((homeId: string) => ({ dir: homeId }));
  const isPluginManager = deps.isPluginManager ?? (() => false);
  const autoUpdate = deps.autoUpdate ?? (() => true);
  const rollbackClone = deps.rollbackClone ?? ((dir: string, plugin: string) => { void realRollbackClone(dir, plugin); });

  let counter = 0;
  const newId = deps.newId ?? (() => `job-${++counter}-${now().toString(36)}`);

  const jobs: Job[] = [];
  let active: { id: string; worker: WorkerHandle; rollback: Rollback } | null = null;

  function replace(job: Job): void {
    const index = jobs.findIndex((j) => j.id === job.id);
    if (index >= 0) jobs[index] = job;
    onChange(job);
  }

  function get(id: string): Job | undefined {
    return jobs.find((j) => j.id === id);
  }

  function end(id: string, status: Job["status"], error?: string): void {
    const job = get(id);
    if (!job || isEnded(job)) return;
    replace({ ...job, status, endedAt: now(), error: error ?? job.error });
    if (active?.id === id) active = null;
    drain();
  }

  function drain(): void {
    const next = nextRunnable(jobs);
    if (!next) return;
    const started: Job = { ...next, status: "running", startedAt: now() };
    replace(started);
    const message: JobMessage = {
      jobId: started.id,
      kind: started.kind,
      plugin: started.plugin,
      url: started.url,
      home: started.home,
      homeDir: resolveHome(started.home).dir,
      isPluginManager: isPluginManager(started.plugin),
      autoUpdate: autoUpdate(),
    };
    const worker = spawnWorker(started, message);
    active = { id: started.id, worker, rollback: "none" };

    worker.onMessage((raw) => {
      const message = raw as { jobId?: string; phase?: string; percent?: number; done?: boolean; error?: string };
      if (message.jobId !== started.id) return;
      const job = get(started.id);
      if (!job || isEnded(job) || job.status === "cancelling") return;
      if (typeof message.phase === "string") {
        replace(applyEvent(job, { phase: message.phase, percent: message.percent ?? -1 }, now()));
        return;
      }
      if (message.error) { end(started.id, "failed", message.error); return; }
      if (message.done) end(started.id, "done");
    });

    worker.onExit((code) => {
      const job = get(started.id);
      if (!job || isEnded(job)) return;
      if (job.status === "cancelling") {
        let error: string | undefined;
        if (active?.rollback === "remove-clone") {
          try {
            rollbackClone(message.homeDir, started.plugin);
          } catch (e: unknown) {
            error = `rollback failed: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
        end(started.id, "cancelled", error);
        return;
      }
      end(started.id, "failed", `the installer exited with code ${code}`);
    });
  }

  return {
    enqueue(spec) {
      const job = newJob(newId(), spec, now());
      jobs.push(job);
      onChange(job);
      drain();
      return get(job.id) ?? job;
    },
    list() {
      return jobs.map((job) => ({ ...job }));
    },
    cancel(id) {
      const job = get(id);
      if (!job) return false;
      const { job: cancelled, rollback } = cancelJob(job, now());
      if (cancelled.status === job.status && rollback === "none") return false;
      replace(cancelled);
      if (cancelled.status === "cancelled") { drain(); return true; }
      if (active?.id === id) {
        active = { ...active, rollback };
        active.worker.kill();
      }
      return true;
    },
    clearFinished() {
      for (let i = jobs.length - 1; i >= 0; i--) if (isEnded(jobs[i])) jobs.splice(i, 1);
    },
  };
}
