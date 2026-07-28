export type Pt = { x: number; y: number };
export type Dims = { width: number; height: number; padTop: number; padRight: number; padBottom: number; padLeft: number };
export type SeriesInput = { key: string; color: string; values: number[] };
export type SeriesPolygon = { key: string; color: string; top: Pt[]; bottom: Pt[] };
export type BarInput = { label: string; value: number; meta?: string };
export type Bar = BarInput & { pct: number };
export type SliceInput = { label: string; value: number; color: string };
export type Arc = SliceInput & { share: number; dPath: string };

export const VIZ_PALETTE = ["#4b53b8", "#2f8f5b", "#b27a1e", "#c0503f", "#6f5bd0", "#2f8f8f", "#c05f9a", "#7a8f2f"];
export const SERIES_COLORS = { input: "#4b53b8", output: "#2f8f5b", reasoning: "#b27a1e" };

export function paletteColor(index: number): string {
  return VIZ_PALETTE[((index % VIZ_PALETTE.length) + VIZ_PALETTE.length) % VIZ_PALETTE.length];
}

export function niceMax(rawMax: number): number {
  if (rawMax <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const n = rawMax / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function dayKey(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

export function dayRange(fromMs: number, toMs: number): string[] {
  const out: string[] = [];
  const cursor = new Date(fromMs);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(toMs);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    out.push(dayKey(cursor.getTime()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export function stackedMax(series: SeriesInput[]): number {
  const cols = series[0]?.values.length ?? 0;
  let max = 0;
  for (let i = 0; i < cols; i++) {
    let sum = 0;
    for (const s of series) sum += s.values[i] ?? 0;
    if (sum > max) max = sum;
  }
  return max;
}

export function stackedAreas(series: SeriesInput[], max: number, dims: Dims): SeriesPolygon[] {
  const cols = series[0]?.values.length ?? 0;
  const innerW = dims.width - dims.padLeft - dims.padRight;
  const innerH = dims.height - dims.padTop - dims.padBottom;
  const xAt = (i: number) => (cols <= 1 ? dims.padLeft + innerW / 2 : dims.padLeft + (innerW * i) / (cols - 1));
  const yAt = (v: number) => dims.height - dims.padBottom - (max <= 0 ? 0 : (innerH * v) / max);
  const cumulative = new Array<number>(cols).fill(0);
  const polygons: SeriesPolygon[] = [];
  for (const s of series) {
    const bottom: Pt[] = [];
    const top: Pt[] = [];
    for (let i = 0; i < cols; i++) {
      const base = cumulative[i];
      const stacked = base + (s.values[i] ?? 0);
      bottom.push({ x: xAt(i), y: yAt(base) });
      top.push({ x: xAt(i), y: yAt(stacked) });
      cumulative[i] = stacked;
    }
    polygons.push({ key: s.key, color: s.color, top, bottom });
  }
  return polygons;
}

export function linePath(points: Pt[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

export function areaPath(poly: SeriesPolygon): string {
  const forward = poly.top.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const backward = [...poly.bottom].reverse().map((p) => `L${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  return `${forward} ${backward} Z`;
}

export function rankBars(items: BarInput[], limit: number): Bar[] {
  const sorted = items
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
  const max = sorted[0]?.value ?? 0;
  return sorted.map((i) => ({ ...i, pct: max > 0 ? i.value / max : 0 }));
}

export function arcPath(cx: number, cy: number, rOuter: number, rInner: number, a0: number, a1: number): string {
  const at = (r: number, a: number) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const o0 = at(rOuter, a0);
  const o1 = at(rOuter, a1);
  const i1 = at(rInner, a1);
  const i0 = at(rInner, a0);
  return [
    `M${o0.x.toFixed(2)} ${o0.y.toFixed(2)}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${o1.x.toFixed(2)} ${o1.y.toFixed(2)}`,
    `L${i1.x.toFixed(2)} ${i1.y.toFixed(2)}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${i0.x.toFixed(2)} ${i0.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function donutArcs(slices: SliceInput[], cx: number, cy: number, rOuter: number, rInner: number): Arc[] {
  const total = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total <= 0) return [];
  let angle = -Math.PI / 2;
  const arcs: Arc[] = [];
  for (const s of slices) {
    const share = Math.max(0, s.value) / total;
    const next = angle + share * Math.PI * 2;
    arcs.push({ ...s, share, dPath: arcPath(cx, cy, rOuter, rInner, angle, next) });
    angle = next;
  }
  return arcs;
}
