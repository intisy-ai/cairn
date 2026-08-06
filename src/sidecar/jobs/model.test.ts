import { describe, it, expect } from "vitest";
import { newJob, nextRunnable, applyEvent, cancelJob, isEnded } from "./model.js";
import type { Job } from "./model.js";

const base = { kind: "install" as const, plugin: "wakatime-sync", url: "u", home: "claude" };

describe("job model", () => {
  it("starts queued and runs the oldest queued job when nothing is running", () => {
    const a = newJob("1", base, 100);
    const b = newJob("2", { ...base, plugin: "other" }, 200);
    expect(a.status).toBe("queued");
    expect(nextRunnable([b, a])?.id).toBe("1");
  });

  it("runs nothing while a job is already in flight", () => {
    const b = newJob("2", { ...base, plugin: "other" }, 200);
    for (const busy of ["running", "cancelling"] as const) {
      const a: Job = { ...newJob("1", base, 100), status: busy };
      expect(nextRunnable([a, b])).toBeUndefined();
    }
  });

  it("runs nothing when every job has ended", () => {
    const done: Job = { ...newJob("1", base, 100), status: "done" };
    expect(nextRunnable([done])).toBeUndefined();
  });

  it("records each phase with the time it took", () => {
    let job: Job = { ...newJob("1", base, 0), status: "running", startedAt: 0 };
    job = applyEvent(job, { phase: "cloning", percent: 10 }, 1000);
    job = applyEvent(job, { phase: "building", percent: 40 }, 4000);
    expect(job.phase).toBe("building");
    expect(job.percent).toBe(40);
    expect(job.phases).toEqual([{ name: "cloning", ms: 3000 }]);
  });

  it("does not invent a phase entry for the first event", () => {
    const job: Job = { ...newJob("1", base, 0), status: "running", startedAt: 0 };
    expect(applyEvent(job, { phase: "cloning", percent: 10 }, 500).phases).toEqual([]);
  });

  it("cancelling a queued job ends it without a rollback", () => {
    const result = cancelJob(newJob("1", base, 0), 500);
    expect(result.job.status).toBe("cancelled");
    expect(result.job.endedAt).toBe(500);
    expect(result.rollback).toBe("none");
  });

  it("cancelling a running install rolls back the clone", () => {
    const running: Job = { ...newJob("1", base, 0), status: "running", phase: "building" };
    const result = cancelJob(running, 500);
    expect(result.job.status).toBe("cancelling");
    expect(result.rollback).toBe("remove-clone");
  });

  it("cancelling a running update keeps the previous version", () => {
    const running: Job = { ...newJob("1", { ...base, kind: "update" }, 0), status: "running", phase: "building" };
    expect(cancelJob(running, 500).rollback).toBe("keep-previous");
  });

  it("refuses to cancel a job that already finished", () => {
    for (const status of ["done", "failed", "cancelled"] as const) {
      const ended: Job = { ...newJob("1", base, 0), status };
      const result = cancelJob(ended, 500);
      expect(result.job.status).toBe(status);
      expect(result.rollback).toBe("none");
    }
  });

  it("knows which statuses have ended", () => {
    expect(isEnded({ ...newJob("1", base, 0), status: "done" })).toBe(true);
    expect(isEnded({ ...newJob("1", base, 0), status: "running" })).toBe(false);
    expect(isEnded(newJob("1", base, 0))).toBe(false);
  });
});
