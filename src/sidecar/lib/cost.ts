import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type PriceEntry = { input: number; output: number };
export type PriceTable = { updatedAt: string; unitPerMillionTokens: boolean; prices: Record<string, PriceEntry> };

const EMPTY: PriceTable = { updatedAt: "", unitPerMillionTokens: true, prices: {} };

// The electron-vite production bundle concatenates this module into a single
// out/main/sidecar.js, so import.meta.url there points at out/main/, two
// levels above vendor/usage/. Unbundled (vitest, ts-node) it stays at
// src/sidecar/lib/, three levels above. Both candidates are tried so the file
// resolves correctly in either context, without hardcoding "which context is
// this" anywhere.
function candidatePaths(): string[] {
  const here = fileURLToPath(new URL(".", import.meta.url));
  return [join(here, "..", "..", "vendor", "usage", "prices.json"), join(here, "..", "..", "..", "vendor", "usage", "prices.json")];
}

export function loadPrices(file?: string): PriceTable {
  try {
    const path = file ?? candidatePaths().find((candidate) => existsSync(candidate));
    if (!path || !existsSync(path)) return EMPTY;
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<PriceTable>;
    if (!parsed || typeof parsed.prices !== "object" || !parsed.prices) return EMPTY;
    return { updatedAt: parsed.updatedAt ?? "", unitPerMillionTokens: parsed.unitPerMillionTokens !== false, prices: parsed.prices };
  } catch {
    return EMPTY;
  }
}

export function estimateModelCost(
  modelId: string,
  tokens: { input: number; output: number; reasoning: number },
  table: PriceTable,
): { usd: number; priced: boolean } {
  const price = table.prices[modelId];
  if (!price) return { usd: 0, priced: false };
  const divisor = table.unitPerMillionTokens ? 1_000_000 : 1;
  const usd = (tokens.input * price.input + (tokens.output + tokens.reasoning) * price.output) / divisor;
  return { usd, priced: true };
}
