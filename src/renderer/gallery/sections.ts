import type { Component } from "svelte";
import Boxes from "./sections/Boxes.svelte";
import Cards from "./sections/Cards.svelte";
import Primitives from "./sections/Primitives.svelte";
import Rows from "./sections/Rows.svelte";
import Overlay from "./sections/Overlay.svelte";
import Screen from "./sections/Screen.svelte";
import Tokens from "./sections/Tokens.svelte";

// viewportHeight is for sections whose content is position:fixed. The shot harness sizes the
// window from scrollHeight, which an overlay never contributes to, so without it a dialog is
// captured against a 200px window and clipped away.
export type Section = { id: string; label: string; component: Component; props?: Record<string, unknown>; viewportHeight?: number };

// One screen per section: a shot has to stay small enough to read, and a stack of whole screens
// does not.
function screen(id: string, label: string): Section {
  return { id, label, component: Screen as Component, props: { which: id } };
}

// One dialog per section, mounted open. Shooting an overlay by clicking the control that opens
// it depends on frames a hidden window may never deliver; rendering it directly is the same
// component in the same state, with no timing at all.
function overlay(id: string, label: string, which: string, viewportHeight = 720): Section {
  return { id: `overlay-${id}`, label, component: Overlay as Component, props: { which }, viewportHeight };
}

export const SECTIONS: Section[] = [
  { id: "tokens", label: "Tokens", component: Tokens },
  { id: "primitives", label: "Primitives", component: Primitives },
  { id: "boxes", label: "Boxes", component: Boxes },
  { id: "rows", label: "Rows", component: Rows },
  { id: "cards", label: "Cards", component: Cards },
  screen("plugins", "Plugins"),
  screen("apps", "Apps"),
  screen("providers", "Providers"),
  screen("accounts", "Accounts"),
  screen("activity", "Activity"),
  screen("libraries", "Libraries"),
  overlay("activity", "Activity detail", "activity-detail"),
  overlay("marketplaces", "Marketplaces", "marketplaces"),
  overlay("endpoints", "Custom endpoints", "custom-endpoints", 520),
  overlay("confirm", "Confirm", "confirm", 420),
];
