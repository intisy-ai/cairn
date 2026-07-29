<script lang="ts">
  import { stackedMax, stackedAreas, areaPath, linePath, niceMax, type SeriesInput, type Dims } from "./chartMath.js";

  let { columns, series, height = 180 }: { columns: string[]; series: SeriesInput[]; height?: number } = $props();

  const WIDTH = 600;
  const TICKS = 4;
  const dims = $derived<Dims>({ width: WIDTH, height, padTop: 12, padRight: 14, padBottom: 24, padLeft: 48 });
  const max = $derived(niceMax(stackedMax(series)));
  const polygons = $derived(stackedAreas(series, max, dims));

  let hoverIndex = $state<number | null>(null);

  const innerH = $derived(height - dims.padTop - dims.padBottom);
  const yTicks = $derived(
    Array.from({ length: TICKS + 1 }, (_, i) => {
      const value = (max * i) / TICKS;
      return { value, y: height - dims.padBottom - (innerH * i) / TICKS };
    }),
  );
  const columnX = $derived(
    columns.map((_, i) => (columns.length <= 1 ? dims.padLeft + (WIDTH - dims.padLeft - dims.padRight) / 2 : dims.padLeft + ((WIDTH - dims.padLeft - dims.padRight) * i) / (columns.length - 1))),
  );
  // Show at most ~6 date labels so they never overlap on dense ranges.
  const xLabelStep = $derived(Math.max(1, Math.ceil(columns.length / 6)));

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
  function formatCompact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
    return String(Math.round(value));
  }
  function shortDay(key: string): string {
    const [, month, day] = key.split("-");
    return month && day ? `${Number(month)}/${Number(day)}` : key;
  }
</script>

{#if columns.length === 0}
  <p class="empty">No usage in this range</p>
{:else}
  <div class="wrap">
    {#if series.length > 0}
      <div class="legend">
        {#each series as s (s.key)}
          <span class="lg"><span class="sw" style="background:{s.color}"></span>{s.key}</span>
        {/each}
      </div>
    {/if}
    <svg viewBox="0 0 {WIDTH} {height}" width="100%" role="img" aria-label="Tokens over time" onpointermove={onMove} onpointerleave={() => (hoverIndex = null)}>
      {#each yTicks as tick (tick.value)}
        <line class="grid" x1={dims.padLeft} y1={tick.y} x2={WIDTH - dims.padRight} y2={tick.y} />
        <text class="ylabel" x={dims.padLeft - 8} y={tick.y + 3}>{formatCompact(tick.value)}</text>
      {/each}
      {#each polygons as poly (poly.key)}
        <path class="area" d={areaPath(poly)} fill={poly.color} />
        <path class="topline" d={linePath(poly.top)} stroke={poly.color} />
      {/each}
      {#each columns as col, i (col)}
        {#if i % xLabelStep === 0 || i === columns.length - 1}
          <text class="xlabel" x={columnX[i]} y={height - 8}>{shortDay(col)}</text>
        {/if}
      {/each}
      {#if hoverIndex !== null && hoverIndex < columns.length}
        <line class="crosshair" x1={columnX[hoverIndex]} y1={dims.padTop} x2={columnX[hoverIndex]} y2={height - dims.padBottom} />
        {#each polygons as poly (poly.key)}
          <circle class="dot" cx={columnX[hoverIndex]} cy={poly.top[hoverIndex]?.y ?? 0} r="2.5" fill={poly.color} />
        {/each}
      {/if}
    </svg>
    {#if hoverIndex !== null && hoverIndex < columns.length}
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
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 8px;
  }
  .lg {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--muted);
    text-transform: capitalize;
  }
  svg {
    display: block;
    max-width: 100%;
    overflow: visible;
  }
  .area {
    opacity: 0.7;
  }
  .topline {
    fill: none;
    stroke-width: 1.5;
    vector-effect: non-scaling-stroke;
  }
  .grid {
    stroke: var(--border);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .ylabel {
    fill: var(--faint);
    font-size: 10px;
    text-anchor: end;
    font-family: var(--mono);
  }
  .xlabel {
    fill: var(--faint);
    font-size: 10px;
    text-anchor: middle;
    font-family: var(--mono);
  }
  .crosshair {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .dot {
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .tip {
    position: absolute;
    top: 30px;
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
