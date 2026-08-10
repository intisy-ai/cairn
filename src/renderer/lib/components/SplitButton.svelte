<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    label,
    disabled = false,
    danger = false,
    block = false,
    progress = -1,
    title,
    onPrimary,
    menu,
  }: {
    label: string;
    disabled?: boolean;
    danger?: boolean;
    block?: boolean;
    // 0..100 paints a progress fill behind the primary label; <0 hides it.
    progress?: number;
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
  <button type="button" class="btn primary" class:danger {disabled} title={title ?? label} onclick={() => onPrimary?.()}>
    {#if progress >= 0}
      <span class="fill" style={`width:${Math.max(4, progress)}%`}></span>
    {/if}
    <span class="lbl">{label}</span>
  </button>
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
  /* min-width:0 lets the label ellipsize instead of the button clipping it mid-word: the
     progress fill needs overflow:hidden here, which turns a too-long label into a cut one. */
  .split.block .primary {
    flex: 1;
    min-width: 0;
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
    background: transparent;
    border-color: color-mix(in srgb, var(--crit) 40%, var(--border));
    color: var(--crit);
  }
  .btn.danger:hover {
    background: color-mix(in srgb, var(--crit) 12%, transparent);
    filter: none;
  }
  .caret.danger {
    border-left-color: color-mix(in srgb, var(--crit) 40%, var(--border));
  }
  .primary {
    position: relative;
    overflow: hidden;
    padding: 8px 13px;
    border-radius: 8px 0 0 8px;
  }
  .primary .fill {
    position: absolute;
    inset: 0 auto 0 0;
    background: rgba(255, 255, 255, 0.22);
    transition: width 0.25s ease;
    pointer-events: none;
  }
  .primary .lbl {
    position: relative;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .caret {
    flex: none;
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
    box-shadow: var(--shadow);
  }
  /* Menu content comes from the caller's snippet, so scoped rules cannot reach it. Owning
     the row appearance here is what keeps every dropdown in the app looking the same. */
  .menu :global(button) {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .menu :global(button:hover:not(:disabled)) {
    background: var(--surface-2);
  }
  .menu :global(button.danger) {
    color: var(--crit);
  }
  .menu :global(button:disabled) {
    color: var(--faint);
    cursor: default;
  }
</style>
