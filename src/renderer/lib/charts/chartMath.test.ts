import { describe, it, expect } from "vitest";
import {
  niceMax,
  dayKey,
  dayRange,
  stackedMax,
  stackedAreas,
  areaPath,
  linePath,
  rankBars,
  arcPath,
  donutArcs,
  paletteColor,
  VIZ_PALETTE,
} from "./chartMath.js";

const DIMS = { width: 600, height: 200, padTop: 10, padRight: 10, padBottom: 20, padLeft: 40 };

describe("niceMax", () => {
  it("rounds up to a 1/2/5 x power-of-ten step", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(1234)).toBe(2000);
    expect(niceMax(6000)).toBe(10000);
    expect(niceMax(4)).toBe(5);
    expect(niceMax(45)).toBe(50);
  });
});

describe("dayKey / dayRange", () => {
  it("formats a local YYYY-MM-DD key", () => {
    const ms = new Date(2026, 6, 3, 15, 0, 0).getTime();
    expect(dayKey(ms)).toBe("2026-07-03");
  });
  it("produces an inclusive continuous day list", () => {
    const from = new Date(2026, 6, 1).getTime();
    const to = new Date(2026, 6, 3).getTime();
    expect(dayRange(from, to)).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]);
  });
});

describe("stackedAreas", () => {
  it("stacks series cumulatively and maps to descending y", () => {
    const series = [
      { key: "a", color: "#111", values: [0, 10] },
      { key: "b", color: "#222", values: [0, 10] },
    ];
    const max = stackedMax(series);
    expect(max).toBe(20);
    const polys = stackedAreas(series, max, DIMS);
    expect(polys).toHaveLength(2);
    // Second column: series a spans value 0..10, series b spans 10..20.
    const aTopY = polys[0].top[1].y;
    const bTopY = polys[1].top[1].y;
    expect(bTopY).toBeLessThan(aTopY); // higher stacked value => smaller y (top of chart)
    // Baseline (value 0) sits at height - padBottom.
    expect(polys[0].bottom[0].y).toBeCloseTo(DIMS.height - DIMS.padBottom, 5);
  });
});

describe("areaPath / linePath", () => {
  it("emits a closed polygon and an open polyline", () => {
    const poly = { key: "a", color: "#111", top: [{ x: 0, y: 0 }, { x: 10, y: 5 }], bottom: [{ x: 0, y: 20 }, { x: 10, y: 20 }] };
    const d = areaPath(poly);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(linePath([{ x: 0, y: 0 }, { x: 5, y: 5 }])).toBe("M0.00 0.00 L5.00 5.00");
  });
});

describe("rankBars", () => {
  it("drops zeros, sorts descending, limits, and sets pct against the max", () => {
    const bars = rankBars(
      [
        { label: "x", value: 10 },
        { label: "y", value: 40 },
        { label: "z", value: 0 },
        { label: "w", value: 20 },
      ],
      2,
    );
    expect(bars.map((b) => b.label)).toEqual(["y", "w"]);
    expect(bars[0].pct).toBe(1);
    expect(bars[1].pct).toBe(0.5);
  });
});

describe("donutArcs / arcPath", () => {
  it("computes shares summing to one and continuous arcs", () => {
    const arcs = donutArcs(
      [
        { label: "a", value: 3, color: "#111" },
        { label: "b", value: 1, color: "#222" },
      ],
      50,
      50,
      40,
      24,
    );
    expect(arcs).toHaveLength(2);
    expect(arcs[0].share).toBeCloseTo(0.75, 5);
    expect(arcs[1].share).toBeCloseTo(0.25, 5);
    expect(arcs[0].dPath.startsWith("M")).toBe(true);
    expect(arcs[0].dPath.endsWith("Z")).toBe(true);
  });
  it("returns no arcs for an all-zero total", () => {
    expect(donutArcs([{ label: "a", value: 0, color: "#111" }], 50, 50, 40, 24)).toEqual([]);
  });
  it("arcPath contains two elliptical-arc commands", () => {
    const d = arcPath(50, 50, 40, 24, 0, Math.PI / 2);
    expect((d.match(/A/g) ?? []).length).toBe(2);
  });
});

describe("palette", () => {
  it("cycles the palette by index", () => {
    expect(paletteColor(0)).toBe(VIZ_PALETTE[0]);
    expect(paletteColor(VIZ_PALETTE.length)).toBe(VIZ_PALETTE[0]);
  });
});
