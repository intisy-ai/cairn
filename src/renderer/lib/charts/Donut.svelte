<script lang="ts">
  import { donutArcs, type SliceInput } from "./chartMath.js";

  let {
    slices,
    selected = null,
    onselect,
  }: { slices: SliceInput[]; selected?: string | null; onselect?: (label: string) => void } = $props();

  const arcs = $derived(donutArcs(slices, 60, 60, 52, 32));

  function pct(share: number): string {
    return `${Math.round(share * 100)}%`;
  }
</script>

{#if arcs.length === 0}
  <p class="empty">Nothing to show</p>
{:else}
  <div class="donut">
    <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label="Token share by provider">
      {#each arcs as arc (arc.label)}
        <path class="slice" class:dim={selected !== null && selected !== arc.label} d={arc.dPath} fill={arc.color} />
      {/each}
    </svg>
    <div class="legend">
      {#each arcs as arc (arc.label)}
        <button class="legend-row" aria-pressed={selected === arc.label} onclick={() => onselect?.(arc.label)}>
          <span class="sw" style="background:{arc.color}"></span>
          <span class="lbl" title={arc.label}>{arc.label}</span>
          <span class="share">{pct(arc.share)}</span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .donut {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  svg {
    flex: none;
    max-width: 100%;
  }
  .slice {
    transition: opacity 0.15s ease;
  }
  .slice.dim {
    opacity: 0.3;
  }
  .legend {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .legend-row {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 4px 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text);
    font-family: var(--ui);
  }
  .legend-row:hover {
    background: var(--surface-2);
  }
  .legend-row[aria-pressed="true"] {
    background: var(--accent-weak);
  }
  .sw {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
  }
  .lbl {
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
    text-align: left;
  }
  .share {
    font-size: 11.5px;
    font-family: var(--mono);
    color: var(--muted);
    flex: none;
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 16px 4px;
    margin: 0;
  }
</style>
