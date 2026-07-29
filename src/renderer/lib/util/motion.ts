import { fade, fly } from "svelte/transition";
import { cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";

export const DUR_FAST = 120;
export const DUR = 180;
export const DUR_SLOW = 260;
export const EASE = cubicOut;

export function reducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
}

export function fadeMotion(node: Element, params: { duration?: number; delay?: number } = {}): TransitionConfig {
  if (reducedMotion()) return { duration: 0 };
  return fade(node, { duration: params.duration ?? DUR_FAST, delay: params.delay ?? 0, easing: EASE });
}

export function flyMotion(node: Element, params: { duration?: number; y?: number; delay?: number } = {}): TransitionConfig {
  if (reducedMotion()) return { duration: 0 };
  return fly(node, { duration: params.duration ?? DUR, y: params.y ?? 6, delay: params.delay ?? 0, easing: EASE });
}
