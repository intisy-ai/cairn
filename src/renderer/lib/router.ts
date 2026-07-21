import { writable } from "svelte/store";

export type ScreenId = "overview" | "providers" | "accounts" | "routing" | "usage" | "localApi" | "appsPlugins";

export type ScreenSection = "main" | "network";

export type ScreenDef = {
  id: ScreenId;
  label: string;
  glyph: string;
  section: ScreenSection;
};

export type RouterState = { screen: ScreenId };

export const SCREENS: readonly ScreenDef[] = [
  { id: "overview", label: "Overview", glyph: "▤", section: "main" },
  { id: "providers", label: "Providers", glyph: "◈", section: "main" },
  { id: "accounts", label: "Accounts", glyph: "◍", section: "main" },
  { id: "routing", label: "Routing", glyph: "⇄", section: "main" },
  { id: "usage", label: "Usage", glyph: "◷", section: "main" },
  { id: "localApi", label: "Local API", glyph: "⇢", section: "network" },
  { id: "appsPlugins", label: "Apps & plugins", glyph: "⊞", section: "network" },
];

export const router = writable<RouterState>({ screen: "overview" });

export function navigate(screen: ScreenId): void {
  router.set({ screen });
}
