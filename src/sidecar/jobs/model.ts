// Pure job state: no filesystem, no processes, no IPC. The runner owns those and reads its
// decisions from here, so every transition is testable on its own.

// The job's shape lives in packages/shared so the renderer and the sidecar cannot drift.
export type { Job, JobKind, JobStatus, JobPhase, JobSample, JobSpec } from "../../../packages/shared/src/domain.js";
import type { Job, JobStatus, JobSpec } from "../../../packages/shared/src/domain.js";

export type Rollback = "none" | "remove-clone" | "keep-previous";

import type { Transfer } from "./gitProgress.js";

export interface WorkerEvent {
  phase: string;
  percent: number;
}

const ENDED: JobStatus[] = ["done", "failed", "cancelled"];

export function newJob(id: string, spec: JobSpec, now: number): Job {
  return { id, ...spec, status: "queued", phase: "", percent: -1, phases: [], samples: [], queuedAt: now };
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
  // Never let the bar walk backwards: a coarse phase boundary can sit below the fine-grained
  // transfer percent the previous phase already reached.
  return { ...job, phases, phase: event.phase, percent: Math.max(job.percent, event.percent), phaseStartedAt: now };
}

// git's transfer progress: the only real byte count and rate in an install. During a transfer
// its percent IS the job's progress, which is what makes the bar move smoothly rather than
// jumping between phase boundaries.
export const MAX_SAMPLES = 120;

export function noteTransfer(job: Job, transfer: Transfer, now: number): Job {
  const next: Job = { ...job };
  if (transfer.bytes !== undefined) next.bytes = transfer.bytes;
  if (transfer.bytesPerSecond !== undefined) {
    next.bytesPerSecond = transfer.bytesPerSecond;
    next.samples = [...job.samples, { ts: now, bytesPerSecond: transfer.bytesPerSecond }].slice(-MAX_SAMPLES);
  }
  if (transfer.bytes !== undefined) next.percent = Math.max(job.percent, transfer.percent);
  return next;
}

// A queued job never touched the home, so it just ends. A running one has to be rolled back to
// the state it started from, and stays "cancelling" until the runner has done that. An update
// and a repair both work on a clone that was already there, so cancelling one keeps it.
export function cancelJob(job: Job, now: number): { job: Job; rollback: Rollback } {
  if (isEnded(job)) return { job, rollback: "none" };
  if (job.status === "queued") return { job: { ...job, status: "cancelled", endedAt: now }, rollback: "none" };
  return {
    job: { ...job, status: "cancelling" },
    rollback: job.kind === "update" || job.kind === "repair" ? "keep-previous" : "remove-clone",
  };
}
