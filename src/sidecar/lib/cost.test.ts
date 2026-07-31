import { describe, it, expect } from "vitest";
import { estimateModelCost } from "./cost.js";

const table = { updatedAt: "2026-01", unitPerMillionTokens: true, prices: { m1: { input: 3, output: 15 } } };

describe("estimateModelCost", () => {
  it("prices input and output (reasoning at output rate), normalized per 1M", () => {
    const r = estimateModelCost("m1", { input: 1_000_000, output: 1_000_000, reasoning: 0 }, table);
    expect(r.priced).toBe(true);
    expect(r.usd).toBeCloseTo(3 + 15, 6);
  });
  it("bills reasoning tokens at the output rate", () => {
    const r = estimateModelCost("m1", { input: 0, output: 0, reasoning: 2_000_000 }, table);
    expect(r.usd).toBeCloseTo(30, 6);
  });
  it("returns unpriced for a model absent from the table", () => {
    const r = estimateModelCost("nope", { input: 1_000_000, output: 0, reasoning: 0 }, table);
    expect(r).toEqual({ usd: 0, priced: false });
  });
});
