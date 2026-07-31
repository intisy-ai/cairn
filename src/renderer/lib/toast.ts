import { writable } from "svelte/store";
import { flushSync } from "svelte";

export type Toast = { id: number; kind: "success" | "error"; message: string };

const SUCCESS_MS = 3000;
const ERROR_MS = 6000;

let nextId = 1;
export const toasts = writable<Toast[]>([]);

// toast.success/error/dismiss are called from plain callbacks (event handlers,
// timers, catch blocks), never from inside a Svelte effect, so a synchronous
// flush is safe and keeps the host's DOM in sync without waiting a microtask.
function flushSafely(): void {
  try {
    flushSync();
  } catch {
    // already inside a Svelte-managed flush, nothing to do
  }
}

function push(kind: Toast["kind"], message: string): void {
  const id = nextId++;
  toasts.update((list) => [...list, { id, kind, message }]);
  flushSafely();
  const ms = kind === "success" ? SUCCESS_MS : ERROR_MS;
  setTimeout(() => dismiss(id), ms);
}

function dismiss(id: number): void {
  toasts.update((list) => list.filter((t) => t.id !== id));
  flushSafely();
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  dismiss,
};
