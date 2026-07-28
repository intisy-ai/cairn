<script lang="ts">
  import { rankBars, type BarInput } from "./chartMath.js";

  let {
    items,
    limit = 12,
    selected = null,
    onselect,
  }: { items: BarInput[]; limit?: number; selected?: string | null; onselect?: (label: string) => void } = $props();

  const bars = $derived(rankBars(items, limit));

  function formatTokens(value: number): string {
    return value.toLocaleString("en-US");
  }
</script>

{#if bars.length === 0}
  <p class="empty">Nothing to show</p>
{:else}
  <div class="bars">
    {#each bars as bar (bar.label)}
      <button class="bar-row" aria-pressed={selected === bar.label} onclick={() => onselect?.(bar.label)}>
        <div class="head">
          <span class="name" title={bar.label}>{bar.label}</span>
          <span class="val">{formatTokens(bar.value)}</span>
        </div>
        <div class="track"><div class="fill" style="width:{(bar.pct * 100).toFixed(1)}%"></div></div>
        {#if bar.meta}<span class="meta">{bar.meta}</span>{/if}
      </button>
    {/each}
  </div>
{/if}

<style>
  .bars {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .bar-row {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    padding: 6px 8px;
    cursor: pointer;
    font-family: var(--ui);
    color: var(--text);
  }
  .bar-row:hover {
    background: var(--surface-2);
  }
  .bar-row[aria-pressed="true"] {
    border-color: var(--accent-border);
    background: var(--accent-weak);
  }
  .head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: baseline;
  }
  .name {
    font-size: 12.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .val {
    font-size: 11.5px;
    font-family: var(--mono);
    color: var(--muted);
    flex: none;
  }
  .track {
    margin-top: 5px;
    height: 6px;
    border-radius: 3px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 3px;
    background: var(--accent);
  }
  .meta {
    display: inline-block;
    margin-top: 4px;
    font-size: 10.5px;
    color: var(--faint);
    font-family: var(--mono);
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 16px 4px;
    margin: 0;
  }
</style>
