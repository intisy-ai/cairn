<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    disabled = false,
    danger = false,
    block = false,
    title,
    onPrimary,
    menu,
  }: {
    label: string;
    disabled?: boolean;
    danger?: boolean;
    block?: boolean;
    title?: string;
    onPrimary?: () => void;
    menu?: Snippet;
  } = $props();

  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  function toggle(): void {
    open = !open;
  }
  function onWindowClick(e: MouseEvent): void {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="split" class:block bind:this={root}>
  <button type="button" class="btn primary" class:danger {disabled} {title} onclick={() => onPrimary?.()}>{label}</button>
  <button
    type="button"
    class="btn caret"
    class:danger
    {disabled}
    aria-label="More install options"
    aria-expanded={open}
    onclick={toggle}
  >
    ▾
  </button>
  {#if open && menu}
    <div class="menu" role="menu">{@render menu()}</div>
  {/if}
</div>

<style>
  .split {
    position: relative;
    display: inline-flex;
  }
  .split.block {
    display: flex;
    width: 100%;
  }
  .split.block .primary {
    flex: 1;
    justify-content: center;
  }
  .btn {
    font-family: var(--ui);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    background: var(--accent);
    border: 1px solid var(--accent);
    color: #fff;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .btn:hover {
    filter: brightness(1.05);
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .btn.danger {
    background: var(--crit);
    border-color: var(--crit);
  }
  .primary {
    padding: 8px 13px;
    border-radius: 8px 0 0 8px;
  }
  .caret {
    padding: 8px 8px;
    border-radius: 0 8px 8px 0;
    border-left: 1px solid rgba(255, 255, 255, 0.3);
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 12rem;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }
</style>
