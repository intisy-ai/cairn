import { writable } from "svelte/store";
import { cairn } from "../ipc.js";

// Counts error-impact activity records seen since the Activity screen was last
// opened. Wired once at app startup (App.svelte) so the sidebar badge stays
// current while the user is on a different screen.
export const unseenErrorCount = writable(0);

export function watchActivityErrors(): () => void {
  return cairn.onActivityEvent((record) => {
    if (record.impact === "error") unseenErrorCount.update((n) => n + 1);
  });
}

export function clearUnseenErrors(): void {
  unseenErrorCount.set(0);
}
