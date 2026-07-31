import { writable, derived } from "svelte/store";
import type { Result } from "@cairn/shared";

export type DownloadStatus = "pending" | "installing" | "done" | "failed";

// Which machinery performed the download: an engine bootstrapped by Cairn itself
// ("cairn"), a plugin-updater-managed install ("plugin-updater"), or a non-plugin
// operation with no source badge (null).
export type DownloadSource = "cairn" | "plugin-updater" | null;

export type DownloadTask = {
  id: number;
  label: string;
  home: string;
  source: DownloadSource;
  status: DownloadStatus;
  step: string;
  // Coarse phase-based progress 0..100 (an install has no true byte percentage);
  // -1 means indeterminate (no phase reported yet).
  percent: number;
  error: string;
  // Optional caller key (e.g. a plugin name) so a UI element can find its own
  // in-flight task without matching on the display label.
  key?: string;
  queuedAt: number;
};

export const downloads = writable<{ tasks: DownloadTask[]; open: boolean }>({ tasks: [], open: false });

// In-flight tasks indexed by their caller key, so a plugin row/button can show
// its own install state and progress instantly.
export const activeByKey = derived(downloads, ($d) => {
  const map: Record<string, DownloadTask> = {};
  for (const t of $d.tasks) {
    if (t.key && (t.status === "pending" || t.status === "installing")) map[t.key] = t;
  }
  return map;
});

let nextId = 1;

// Downloads run one at a time so the panel shows a clear pending -> installing
// progression instead of every install firing at once.
const CONCURRENCY = 1;
let active = 0;
const queue: Array<() => Promise<void>> = [];

function patch(id: number, partial: Partial<DownloadTask>): void {
  downloads.update((state) => ({
    ...state,
    tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...partial } : task)),
  }));
}

function drain(): void {
  while (active < CONCURRENCY && queue.length > 0) {
    const run = queue.shift()!;
    active++;
    void run().finally(() => {
      active--;
      drain();
    });
  }
}

export type EnqueueSpec<T> = {
  label: string;
  home: string;
  source?: DownloadSource;
  key?: string;
  // The task id is passed in so the caller can correlate live progress events.
  run: (id: number) => Promise<Result<T>>;
  // summarizeFailure flags a partial failure a plain ok/error Result can't express,
  // e.g. a multi-home install where the call succeeded but some homes failed.
  summarizeFailure?: (data: T) => string | null;
};

export function enqueue<T>(spec: EnqueueSpec<T>): Promise<Result<T>> {
  const id = nextId++;
  downloads.update((state) => ({
    tasks: [
      ...state.tasks,
      { id, label: spec.label, home: spec.home, source: spec.source ?? null, status: "pending", step: "", percent: -1, error: "", key: spec.key, queuedAt: Date.now() },
    ],
    open: true,
  }));

  return new Promise<Result<T>>((resolve) => {
    queue.push(async () => {
      patch(id, { status: "installing" });
      try {
        const result = await spec.run(id);
        if (result.ok) {
          const failure = spec.summarizeFailure?.(result.data) ?? null;
          if (failure) patch(id, { status: "failed", error: failure });
          else patch(id, { status: "done" });
        } else {
          patch(id, { status: "failed", error: result.error });
        }
        resolve(result);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        patch(id, { status: "failed", error });
        resolve({ ok: false, error });
      }
    });
    drain();
  });
}

export function track<T>(
  label: string,
  home: string,
  run: () => Promise<Result<T>>,
  summarizeFailure?: (data: T) => string | null,
): Promise<Result<T>> {
  return enqueue({ label, home, run, summarizeFailure });
}

// Applied from a pushed progress event; only meaningful while the task is still
// in flight (a finished task keeps its terminal line).
export function setStep(id: number, step: string, percent = -1): void {
  downloads.update((state) => ({
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === id && (task.status === "pending" || task.status === "installing") ? { ...task, step, percent } : task,
    ),
  }));
}

export function toggleDownloads(): void {
  downloads.update((state) => ({ ...state, open: !state.open }));
}

export function closeDownloads(): void {
  downloads.update((state) => ({ ...state, open: false }));
}

export function clearFinished(): void {
  downloads.update((state) => ({
    ...state,
    tasks: state.tasks.filter((task) => task.status === "pending" || task.status === "installing"),
  }));
}

// Tests share this module's queue state; clear the pending queue and the single
// concurrency slot between cases so an orphaned never-resolving run can't block
// the next test. Not used by the app.
export function resetDownloadsForTest(): void {
  active = 0;
  queue.length = 0;
  nextId = 1;
  downloads.set({ tasks: [], open: false });
}
