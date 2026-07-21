import { writable } from "svelte/store";

export type Theme = "light" | "dark";

export const theme = writable<Theme>("light");

export function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  theme.set(next);
}
