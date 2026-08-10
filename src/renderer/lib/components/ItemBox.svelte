<script lang="ts">
  import type { Snippet } from "svelte";
  import { flyMotion } from "../util/motion.js";

  let {
    view = "list",
    columns = "",
    testid = "",
    title,
    subtitle = "",
    monoSubtitle = false,
    selected = false,
    openLabel = "",
    onOpen,
    icon,
    badges,
    meta,
    actions,
    corner,
  }: {
    view?: "list" | "grid";
    columns?: string;
    testid?: string;
    title: string;
    subtitle?: string;
    monoSubtitle?: boolean;
    selected?: boolean;
    openLabel?: string;
    onOpen?: () => void;
    icon?: Snippet;
    badges?: Snippet;
    meta?: Snippet;
    actions?: Snippet;
    corner?: Snippet;
  } = $props();

  // badges and meta render inside the open control, so neither may contain anything focusable:
  // a nested button ends the outer one early and the row falls apart.
  const isGrid = $derived(view === "grid");
</script>

<div
  class="box"
  class:grid={isGrid}
  class:has-corner={!!corner}
  class:selected
  data-testid={testid || undefined}
  style={!isGrid && columns ? `grid-template-columns:${columns}` : undefined}
  in:flyMotion={{ y: 6 }}
>
  {#snippet openContent()}
    {#if icon}{@render icon()}{/if}
    <span class="text">
      <span class="titleline">
        <b>{title}</b>
        {#if badges}{@render badges()}{/if}
      </span>
      {#if subtitle}<span class="subtitle" class:mono={monoSubtitle}>{subtitle}</span>{/if}
      {#if meta}{@render meta()}{/if}
    </span>
  {/snippet}

  {#if onOpen}
    <button type="button" class="open" title={openLabel || undefined} onclick={onOpen}>
      {@render openContent()}
    </button>
  {:else}
    <div class="open">{@render openContent()}</div>
  {/if}

  {#if corner}<div class="corner">{@render corner()}</div>{/if}

  {#if actions}
    {#if isGrid}
      <div class="footer">{@render actions()}</div>
    {:else if columns}
      <!-- Each action is its own grid cell, so the same column lines up down the whole list. -->
      {@render actions()}
    {:else}
      <div class="actions">{@render actions()}</div>
    {/if}
  {/if}
</div>

<style>
  .box {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-xl);
    padding: var(--space-lg) var(--space-2xl);
    border-top: var(--hairline) solid var(--border);
  }
  .box.has-corner:not(.grid) {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .box:first-child {
    border-top: 0;
  }
  .box:hover {
    background: var(--surface-2);
  }
  .box.grid {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-md);
    height: 100%;
    padding: var(--space-lg);
    background: var(--surface-2);
    border: var(--hairline) solid var(--border);
    border-radius: var(--radius-md);
  }
  .box.grid:hover,
  .box.grid.selected {
    border-color: var(--border-strong);
  }
  .box.selected:not(.grid) {
    background: var(--surface-2);
  }

  .open {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-lg);
    min-width: 0;
    width: 100%;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    color: inherit;
    font: inherit;
  }
  .box.grid .open {
    align-items: start;
  }
  button.open {
    cursor: pointer;
  }
  button.open:focus-visible {
    outline: var(--space-3xs) solid var(--accent);
    outline-offset: var(--space-3xs);
    border-radius: var(--radius-sm);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    min-width: 0;
  }
  .titleline {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
  .titleline b {
    font-size: var(--fs-md);
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .subtitle {
    color: var(--faint);
    font-size: var(--fs-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .subtitle.mono {
    font-family: var(--mono);
    font-size: var(--fs-micro);
  }

  /* In a card the corner affordance floats over the content; in a row it is just another
     cell, which is where a row has space for it. */
  .box.grid .corner {
    position: absolute;
    top: var(--space-md);
    right: var(--space-md);
    z-index: 1;
  }
  .box.grid.has-corner .open {
    padding-right: var(--space-4xl);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-sm);
  }

  /* Cards stretch to the tallest in their row; without this the action sits at a different
     height in every card and the grid reads as ragged. */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-sm);
    margin-top: auto;
  }
</style>
