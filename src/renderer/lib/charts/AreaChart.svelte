<script lang="ts">
  import { stackedMax, stackedAreas, areaPath, niceMax, type SeriesInput, type Dims } from "./chartMath.js";

  let { columns, series, height = 180 }: { columns: string[]; series: SeriesInput[]; height?: number } = $props();

  const WIDTH = 600;
  const dims = $derived<Dims>({ width: WIDTH, height, padTop: 12, padRight: 12, padBottom: 22, padLeft: 44 });
  const max = $derived(niceMax(stackedMax(series)));
  const polygons = $derived(stackedAreas(series, max, dims));

  let hoverIndex = $state<number | null>(null);

  const columnX = $derived(
    columns.map((_, i) => (columns.length <= 1 ? dims.padLeft + (WIDTH - dims.padLeft - dims.padRight) / 2 : dims.padLeft + ((WIDTH - dims.padLeft - dims.padRight) * i) / (columns.length - 1))),
  );

  function onMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < columnX.length; i++) {
      const d = Math.abs(columnX[i] - px);
      if (d < best) {
        best = d;
        nearest = i;
      }
    }
    hoverIndex = columns.length ? nearest : null;
  }

  function formatTokens(value: number): string {
    return value.toLocaleString("en-US");
  }
</script>

{#if columns.length === 0}
  <p class="empty">No usage in this range</p>
{:else}
  <div class="wrap">
    <svg viewBox="0 0 {WIDTH} {height}" width="100%" role="img" aria-label="Tokens over time" onpointermove={onMove} onpointerleave={() => (hoverIndex = null)}>
      <line class="axis" x1={dims.padLeft} y1={height - dims.padBottom} x2={WIDTH - dims.padRight} y2={height - dims.padBottom} />
      {#each polygons as poly (poly.key)}
        <path class="area" d={areaPath(poly)} fill={poly.color} />
      {/each}
      {#if hoverIndex !== null}
        <line class="crosshair" x1={columnX[hoverIndex]} y1={dims.padTop} x2={columnX[hoverIndex]} y2={height - dims.padBottom} />
      {/if}
    </svg>
    {#if hoverIndex !== null}
      <div class="tip">
        <p class="day">{columns[hoverIndex]}</p>
        {#each series as s (s.key)}
          <p class="line"><span class="sw" style="background:{s.color}"></span>{s.key}: {formatTokens(s.values[hoverIndex] ?? 0)}</p>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap {
    position: relative;
  }
  svg {
    display: block;
    max-width: 100%;
  }
  .area {
    opacity: 0.85;
  }
  .axis {
    stroke: var(--border);
    stroke-width: 1;
  }
  .crosshair {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }
  .tip {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
    box-shadow: var(--shadow);
    font-size: 11.5px;
    pointer-events: none;
  }
  .tip .day {
    margin: 0 0 4px;
    font-weight: 650;
    font-size: 11px;
    color: var(--muted);
  }
  .tip .line {
    margin: 2px 0;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--mono);
  }
  .sw {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    display: inline-block;
    flex: none;
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 20px 4px;
    margin: 0;
  }
</style>
