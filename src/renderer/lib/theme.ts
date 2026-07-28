import { writable } from "svelte/store";

export type Theme = "light" | "dark";
export type ThemeSetting = "system" | "light" | "dark";

export const theme = writable<Theme>("dark");

export function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  theme.set(next);
}

export function initTheme(): void {
  setTheme("dark");
}

let systemQuery: MediaQueryList | null = null;
let systemListener: ((event: MediaQueryListEvent) => void) | null = null;

function stopFollowingSystem(): void {
  if (systemQuery && systemListener) systemQuery.removeEventListener("change", systemListener);
  systemQuery = null;
  systemListener = null;
}

export function applyThemeSetting(setting: ThemeSetting): void {
  stopFollowingSystem();
  if (setting !== "system") {
    setTheme(setting);
    return;
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = (event: MediaQueryListEvent): void => setTheme(event.matches ? "dark" : "light");
  systemQuery = query;
  systemListener = listener;
  setTheme(query.matches ? "dark" : "light");
  query.addEventListener("change", listener);
}
