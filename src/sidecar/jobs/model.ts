// Pure job state: no filesystem, no processes, no IPC. The runner owns those and reads its
// decisions from here, so every transition is testable on its own.

// The job's shape lives in packages/shared so the renderer and the sidecar cannot drift.
export type { Job, JobKind, JobStatus, JobPhase, JobSpec } from "../../../packages/shared/src/domain.js";
import type { Job, JobStatus, JobSpec } from "../../../packages/shared/src/domain.js";

export type Rollback = "none" | "remove-clone" | "keep-previous";

export interface WorkerEvent {
  phase: string;
  percent: number;
}

const ENDED: JobStatus[] = ["done", "failed", "cancelled"];

export function newJob(id: string, spec: JobSpec, now: number): Job {
  return { id, ...spec, status: "queued", phase: "", percent: -1, phases: [], queuedAt: now };
}

export function isEnded(job: Job): boolean {
  return ENDED.includes(job.status);
}

// One job at a time: the oldest queued job, and only when nothing is in flight. A cancelling
// job still holds the slot, because its rollback is not finished.
export function nextRunnable(jobs: Job[]): Job | undefined {
  if (jobs.some((job) => job.status === "running" || job.status === "cancelling")) return undefined;
  return jobs.filter((job) => job.status === "queued").sort((a, b) => a.queuedAt - b.queuedAt)[0];
}

// A phase change closes the previous phase with the time it actually took, which is what lets
// the UI show real durations instead of a fixed guess.
export function applyEvent(job: Job, event: WorkerEvent, now: number): Job {
  const startedAt = job.phaseStartedAt ?? job.startedAt ?? now;
  const phases = job.phase ? [...job.phases, { name: job.phase, ms: now - startedAt }] : job.phases;
  return { ...job, phases, phase: event.phase, percent: event.percent, phaseStartedAt: now };
}

// A queued job never touched the home, so it just ends. A running one has to be rolled back to
// the state it started from, and stays "cancelling" until the runner has done that.
export function cancelJob(job: Job, now: number): { job: Job; rollback: Rollback } {
  if (isEnded(job)) return { job, rollback: "none" };
  if (job.status === "queued") return { job: { ...job, status: "cancelled", endedAt: now }, rollback: "none" };
  return {
    job: { ...job, status: "cancelling" },
    rollback: job.kind === "update" ? "keep-previous" : "remove-clone",
  };
}
