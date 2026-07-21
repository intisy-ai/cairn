<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "default",
    type = "button",
    onclick,
    children,
  }: {
    variant?: "default" | "primary";
    type?: "button" | "submit";
    onclick?: () => void;
    children?: Snippet;
  } = $props();
</script>

<button {type} class="btn" class:primary={variant === "primary"} {onclick}>
  {#if children}{@render children()}{/if}
</button>

<style>
  .btn {
    font-family: var(--ui);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 8px;
    padding: 8px 13px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .btn:hover {
    border-color: var(--faint);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .btn.primary:hover {
    filter: brightness(1.05);
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
