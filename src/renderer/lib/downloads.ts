import { writable } from "svelte/store";
import type { Result } from "@cairn/shared";

export type DownloadStatus = "running" | "done" | "failed";

export type DownloadTask = {
  id: number;
  label: string;
  home: string;
  status: DownloadStatus;
  error: string;
  startedAt: number;
};

export const downloads = writable<{ tasks: DownloadTask[]; open: boolean }>({ tasks: [], open: false });

let nextId = 1;

function setTaskStatus(id: number, status: DownloadStatus, error: string): void {
  downloads.update((state) => ({
    ...state,
    tasks: state.tasks.map((task) => (task.id === id ? { ...task, status, error } : task)),
  }));
}

/**
 * summarizeFailure lets a caller flag a partial failure that a plain ok/error Result can't
 * express, e.g. a multi-home install where the overall call succeeded but some homes failed.
 * Return an error string to mark the task failed, or null when data is fully ok.
 */
export async function track<T>(
  label: string,
  home: string,
  run: () => Promise<Result<T>>,
  summarizeFailure?: (data: T) => string | null,
): Promise<Result<T>> {
  const id = nextId++;
  downloads.update((state) => ({
    tasks: [...state.tasks, { id, label, home, status: "running", error: "", startedAt: Date.now() }],
    open: true,
  }));

  try {
    const result = await run();
    if (result.ok) {
      const failure = summarizeFailure?.(result.data) ?? null;
      if (failure) setTaskStatus(id, "failed", failure);
      else setTaskStatus(id, "done", "");
    } else {
      setTaskStatus(id, "failed", result.error);
    }
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    setTaskStatus(id, "failed", error);
    return { ok: false, error };
  }
}

export function toggleDownloads(): void {
  downloads.update((state) => ({ ...state, open: !state.open }));
}

export function clearFinished(): void {
  downloads.update((state) => ({ ...state, tasks: state.tasks.filter((task) => task.status === "running") }));
}
