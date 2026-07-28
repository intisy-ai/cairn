<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    variant = "default",
    type = "button",
    disabled = false,
    title = "",
    onclick,
    children,
  }: {
    variant?: "default" | "primary" | "danger";
    type?: "button" | "submit";
    disabled?: boolean;
    title?: string;
    onclick?: () => void;
    children?: Snippet;
  } = $props();
</script>

<button
  {type}
  class="btn"
  class:primary={variant === "primary"}
  class:danger={variant === "danger"}
  {disabled}
  {title}
  {onclick}
>
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
  .btn.danger {
    background: var(--crit-weak);
    border-color: var(--crit);
    color: var(--crit);
  }
  .btn.danger:hover {
    background: var(--crit);
    color: #fff;
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
</style>
