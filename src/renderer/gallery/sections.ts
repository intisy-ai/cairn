import type { Component } from "svelte";
import Boxes from "./sections/Boxes.svelte";
import Cards from "./sections/Cards.svelte";
import Primitives from "./sections/Primitives.svelte";
import Rows from "./sections/Rows.svelte";
import Screens from "./sections/Screens.svelte";
import Tokens from "./sections/Tokens.svelte";

export type Section = { id: string; label: string; component: Component };

export const SECTIONS: Section[] = [
  { id: "tokens", label: "Tokens", component: Tokens },
  { id: "primitives", label: "Primitives", component: Primitives },
  { id: "boxes", label: "Boxes", component: Boxes },
  { id: "rows", label: "Rows", component: Rows },
  { id: "cards", label: "Cards", component: Cards },
  { id: "screens", label: "Screens", component: Screens },
];
