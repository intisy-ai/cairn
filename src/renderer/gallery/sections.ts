import type { Component } from "svelte";
import Boxes from "./sections/Boxes.svelte";
import Cards from "./sections/Cards.svelte";
import Primitives from "./sections/Primitives.svelte";
import Rows from "./sections/Rows.svelte";
import Screen from "./sections/Screen.svelte";
import Tokens from "./sections/Tokens.svelte";

export type Section = { id: string; label: string; component: Component; props?: Record<string, unknown> };

// One screen per section: a shot has to stay small enough to read, and a stack of whole screens
// does not.
function screen(id: string, label: string): Section {
  return { id, label, component: Screen as Component, props: { which: id } };
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
];
