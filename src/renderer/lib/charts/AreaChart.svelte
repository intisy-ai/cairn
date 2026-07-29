<script lang="ts">
  import { stackedMax, stackedAreas, areaPath, linePath, niceMax, type SeriesInput, type Dims } from "./chartMath.js";

  let { columns, series, height = 150 }: { columns: string[]; series: SeriesInput[]; height?: number } = $props();

  const WIDTH = 600;
  const TICKS = 4;
  const dims = $derived<Dims>({ width: WIDTH, height, padTop: 10, padRight: 12, padBottom: 20, padLeft: 46 });
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
  // Percent positions so HTML labels stay crisp regardless of render width.
  function pctX(x: number): number {
    return (x / WIDTH) * 100;
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
    <div class="plot" style="height:{height}px">
      <svg viewBox="0 0 {WIDTH} {height}" preserveAspectRatio="none" role="img" aria-label="Tokens over time" onpointermove={onMove} onpointerleave={() => (hoverIndex = null)}>
        {#each yTicks as tick (tick.value)}
          <line class="grid" x1={dims.padLeft} y1={tick.y} x2={WIDTH - dims.padRight} y2={tick.y} />
        {/each}
        {#each polygons as poly (poly.key)}
          <path class="area" d={areaPath(poly)} fill={poly.color} />
          <path class="topline" d={linePath(poly.top)} stroke={poly.color} />
        {/each}
        {#if hoverIndex !== null && hoverIndex < columns.length}
          <line class="crosshair" x1={columnX[hoverIndex]} y1={dims.padTop} x2={columnX[hoverIndex]} y2={height - dims.padBottom} />
        {/if}
      </svg>
      {#each yTicks as tick (tick.value)}
        <span class="ylabel" style="top:{tick.y}px">{formatCompact(tick.value)}</span>
      {/each}
      {#each columns as col, i (col)}
        {#if i % xLabelStep === 0 || i === columns.length - 1}
          <span class="xlabel" style="left:{pctX(columnX[i])}%">{shortDay(col)}</span>
        {/if}
      {/each}
      {#if hoverIndex !== null && hoverIndex < columns.length}
        <div class="tip">
          <p class="day">{columns[hoverIndex]}</p>
          {#each series as s (s.key)}
            <p class="line"><span class="sw" style="background:{s.color}"></span>{s.key}: {formatTokens(s.values[hoverIndex] ?? 0)}</p>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .wrap {
    position: relative;
    font-size: 11px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 6px;
  }
  .lg {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--muted);
    text-transform: capitalize;
  }
  .plot {
    position: relative;
    width: 100%;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
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
    position: absolute;
    left: 0;
    width: 38px;
    text-align: right;
    transform: translateY(-50%);
    font-size: 10px;
    color: var(--faint);
    font-family: var(--mono);
    pointer-events: none;
  }
  .xlabel {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    font-size: 10px;
    color: var(--faint);
    font-family: var(--mono);
    pointer-events: none;
  }
  .crosshair {
    stroke: var(--faint);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .tip {
    position: absolute;
    top: 4px;
    right: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 9px;
    box-shadow: var(--shadow);
    font-size: 11px;
    pointer-events: none;
  }
  .tip .day {
    margin: 0 0 3px;
    font-weight: 650;
    font-size: 10.5px;
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
    font-size: 12px;
    padding: 18px 4px;
    margin: 0;
  }
</style>
