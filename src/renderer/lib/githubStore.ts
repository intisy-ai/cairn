import { writable } from "svelte/store";

// Bumped whenever the active GitHub account changes (add/switch/remove) so any
// screen relying on GitHub-derived data (e.g. the plugin catalog) can react
// without the titlebar and that screen needing to know about each other.
export const githubChanged = writable(0);

export function bumpGithub(): void {
  githubChanged.update((n) => n + 1);
}
