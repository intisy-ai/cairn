import { writable } from "svelte/store";

export type ScreenId = "overview" | "providers" | "accounts" | "routing" | "usage" | "localApi" | "apps" | "plugins" | "settings";

export type ScreenSection = "main" | "network";

export type ScreenDef = {
  id: ScreenId;
  label: string;
  glyph: string;
  section: ScreenSection;
};

export type RouterState = { screen: ScreenId; params?: Record<string, string> };

export const SCREENS: readonly ScreenDef[] = [
  { id: "overview", label: "Overview", glyph: "▤", section: "main" },
  { id: "providers", label: "Providers", glyph: "◈", section: "main" },
  { id: "accounts", label: "Accounts", glyph: "◍", section: "main" },
  { id: "routing", label: "Routing", glyph: "⇄", section: "main" },
  { id: "usage", label: "Usage", glyph: "◷", section: "main" },
  { id: "localApi", label: "Local API", glyph: "⇢", section: "network" },
  { id: "apps", label: "Apps", glyph: "▤", section: "network" },
  { id: "plugins", label: "Plugins", glyph: "⊞", section: "network" },
  { id: "settings", label: "Settings", glyph: "⚙", section: "network" },
];

export const router = writable<RouterState>({ screen: "overview" });

export type NavState = { canBack: boolean; canForward: boolean; backLabel: string };
export const nav = writable<NavState>({ canBack: false, canForward: false, backLabel: "" });

const past: RouterState[] = [];
const future: RouterState[] = [];

function labelOf(id: ScreenId): string {
  return SCREENS.find((screen) => screen.id === id)?.label ?? "";
}

function currentState(): RouterState {
  let state: RouterState = { screen: "overview" };
  router.subscribe((value) => (state = value))();
  return state;
}

function syncNav(): void {
  nav.set({
    canBack: past.length > 0,
    canForward: future.length > 0,
    backLabel: past.length > 0 ? labelOf(past[past.length - 1].screen) : "",
  });
}

export function navigate(screen: ScreenId, params?: Record<string, string>): void {
  const current = currentState();
  if (current.screen !== screen) {
    past.push(current);
    future.length = 0;
  }
  router.set({ screen, params });
  syncNav();
}

export function back(): void {
  if (past.length === 0) return;
  future.push(currentState());
  router.set(past.pop() as RouterState);
  syncNav();
}

export function forward(): void {
  if (future.length === 0) return;
  past.push(currentState());
  router.set(future.pop() as RouterState);
  syncNav();
}

export function consumeParams(): Record<string, string> | undefined {
  let currentParams: Record<string, string> | undefined;
  router.subscribe((state) => {
    currentParams = state.params;
  })();
  if (currentParams === undefined) return undefined;
  router.update((state) => ({ ...state, params: undefined }));
  return currentParams;
}
