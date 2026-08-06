import { describe, it, expect, vi } from "vitest";
import { createRunner } from "./runner.js";
import type { WorkerHandle } from "./runner.js";
import type { Job } from "./model.js";

interface FakeWorker extends WorkerHandle {
  emit(message: unknown): void;
  exit(code: number | null): void;
  killed: boolean;
  sent: unknown;
}

function fakeWorkers() {
  const made: FakeWorker[] = [];
  const spawn = (_job: Job, message: unknown): WorkerHandle => {
    let onMessage: (m: unknown) => void = () => {};
    let onExit: (c: number | null) => void = () => {};
    const worker: FakeWorker = {
      sent: message,
      killed: false,
      onMessage: (fn) => { onMessage = fn; },
      onExit: (fn) => { onExit = fn; },
      kill: () => { worker.killed = true; },
      emit: (m) => onMessage(m),
      exit: (c) => onExit(c),
    };
    made.push(worker);
    return worker;
  };
  return { made, spawn };
}

const spec = { kind: "install" as const, plugin: "wakatime-sync", url: "u", home: "claude" };

function runnerWith(overrides: Record<string, unknown> = {}) {
  const { made, spawn } = fakeWorkers();
  const changes: Job[] = [];
  let id = 0;
  const runner = createRunner({
    spawnWorker: spawn,
    now: () => 1000,
    newId: () => `j${++id}`,
    onChange: (job) => changes.push({ ...job }),
    resolveHome: (homeId) => ({ dir: `/homes/${homeId}` }),
    isPluginManager: (name) => name === "plugin-updater",
    autoUpdate: () => true,
    rollbackClone: vi.fn(),
    ...overrides,
  });
  return { runner, made, changes };
}

describe("job runner", () => {
  it("starts the first job immediately and tells the worker what to do", () => {
    const { runner, made } = runnerWith();
    const job = runner.enqueue(spec);
    expect(runner.list()[0].status).toBe("running");
    expect(job.id).toBe("j1");
    expect(made).toHaveLength(1);
    expect(made[0].sent).toMatchObject({
      jobId: "j1", kind: "install", plugin: "wakatime-sync", home: "claude",
      homeDir: "/homes/claude", isPluginManager: false, autoUpdate: true,
    });
  });

  it("marks the plugin manager so the worker registers it with the app", () => {
    const { runner, made } = runnerWith();
    runner.enqueue({ ...spec, plugin: "plugin-updater" });
    expect(made[0].sent).toMatchObject({ isPluginManager: true });
  });

  it("holds a second job queued until the first ends, then runs it", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    runner.enqueue({ ...spec, plugin: "second" });
    expect(runner.list().map((j) => j.status)).toEqual(["running", "queued"]);
    expect(made).toHaveLength(1);

    made[0].emit({ jobId: "j1", done: true });
    made[0].exit(0);
    expect(runner.list().map((j) => j.status)).toEqual(["done", "running"]);
    expect(made).toHaveLength(2);
  });

  it("records phases reported by the worker", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    made[0].emit({ jobId: "j1", phase: "downloading", percent: 10 });
    expect(runner.list()[0].phase).toBe("downloading");
    expect(runner.list()[0].percent).toBe(10);
  });

  it("fails a job when the worker reports an error", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    made[0].emit({ jobId: "j1", error: "clone refused" });
    made[0].exit(1);
    expect(runner.list()[0]).toMatchObject({ status: "failed", error: "clone refused" });
  });

  it("fails a job when the worker dies without saying anything", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    made[0].exit(9);
    expect(runner.list()[0].status).toBe("failed");
    expect(runner.list()[0].error).toContain("9");
  });

  it("cancels a queued job without touching a worker", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    const queued = runner.enqueue({ ...spec, plugin: "second" });
    expect(runner.cancel(queued.id)).toBe(true);
    expect(runner.list()[1].status).toBe("cancelled");
    expect(made).toHaveLength(1);
  });

  it("cancels a running install by killing the worker, then rolls back the clone", () => {
    const rollbackClone = vi.fn();
    const { runner, made } = runnerWith({ rollbackClone });
    const job = runner.enqueue(spec);
    runner.cancel(job.id);
    expect(runner.list()[0].status).toBe("cancelling");
    expect(made[0].killed).toBe(true);
    expect(rollbackClone).not.toHaveBeenCalled();

    made[0].exit(null);
    expect(rollbackClone).toHaveBeenCalledWith("/homes/claude", "wakatime-sync");
    expect(runner.list()[0].status).toBe("cancelled");
  });

  it("keeps the previous version when a cancelled job was an update", () => {
    const rollbackClone = vi.fn();
    const { runner, made } = runnerWith({ rollbackClone });
    const job = runner.enqueue({ ...spec, kind: "update" });
    runner.cancel(job.id);
    made[0].exit(null);
    expect(rollbackClone).not.toHaveBeenCalled();
    expect(runner.list()[0].status).toBe("cancelled");
  });

  it("reports a rollback that fails instead of swallowing it", () => {
    const rollbackClone = vi.fn(() => { throw new Error("EBUSY"); });
    const { runner, made } = runnerWith({ rollbackClone });
    const job = runner.enqueue(spec);
    runner.cancel(job.id);
    made[0].exit(null);
    expect(runner.list()[0].status).toBe("cancelled");
    expect(runner.list()[0].error).toContain("EBUSY");
  });

  it("runs the next job after a cancellation", () => {
    const { runner, made } = runnerWith();
    const first = runner.enqueue(spec);
    runner.enqueue({ ...spec, plugin: "second" });
    runner.cancel(first.id);
    made[0].exit(null);
    expect(runner.list().map((j) => j.status)).toEqual(["cancelled", "running"]);
  });

  it("refuses to cancel an id it does not know", () => {
    const { runner } = runnerWith();
    expect(runner.cancel("nope")).toBe(false);
  });

  it("emits a change for every transition", () => {
    const { runner, made, changes } = runnerWith();
    runner.enqueue(spec);
    made[0].emit({ jobId: "j1", phase: "downloading", percent: 10 });
    made[0].emit({ jobId: "j1", done: true });
    made[0].exit(0);
    expect(changes.map((c) => c.status)).toEqual(["queued", "running", "running", "done"]);
  });

  it("drops ended jobs when asked, keeping the live ones", () => {
    const { runner, made } = runnerWith();
    runner.enqueue(spec);
    runner.enqueue({ ...spec, plugin: "second" });
    made[0].emit({ jobId: "j1", done: true });
    made[0].exit(0);
    runner.clearFinished();
    expect(runner.list().map((j) => j.plugin)).toEqual(["second"]);
  });
});
