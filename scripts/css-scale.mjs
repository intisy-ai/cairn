// Fails when a component style block hardcodes a size or a colour instead of taking one from
// the scale in app.css. Existing drift is held in a per-file baseline that may only shrink, so
// `--write` after a cleanup is the only way a number in it goes down.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SCAN_DIR = join(ROOT, "src", "renderer");
const BASELINE = join(ROOT, "scripts", "css-scale-baseline.json");

const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g;
// 1px is the one literal the scale does not replace: it is the hairline every border uses.
const RAW_LENGTH = /(?<![\w.-])(?!1px)(\d+(?:\.\d+)?)px\b/g;
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g;

// The gallery is a lab bench for the product UI, not part of it; its own chrome is not held
// to the scale.
const SKIP_DIR = "gallery";

function svelteFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== SKIP_DIR) found.push(...svelteFiles(path));
    } else if (entry.name.endsWith(".svelte")) found.push(path);
  }
  return found.sort();
}

function violationsIn(source) {
  const found = [];
  for (const [, block] of source.matchAll(STYLE_BLOCK)) {
    for (const line of block.split("\n")) {
      // A breakpoint is a viewport fact, not a spacing decision.
      if (line.trimStart().startsWith("@media")) continue;
      for (const match of line.matchAll(RAW_LENGTH)) found.push(match[0]);
      for (const match of line.matchAll(RAW_COLOUR)) found.push(match[0]);
    }
  }
  return found;
}

function scan() {
  const counts = {};
  const samples = {};
  for (const file of svelteFiles(SCAN_DIR)) {
    const key = relative(ROOT, file).split("\\").join("/");
    const found = violationsIn(readFileSync(file, "utf-8"));
    if (found.length === 0) continue;
    counts[key] = found.length;
    samples[key] = [...new Set(found)].slice(0, 5);
  }
  return { counts, samples };
}

const { counts, samples } = scan();

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  console.log(`wrote ${Object.keys(counts).length} entries to ${relative(ROOT, BASELINE)}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf-8"));
const regressions = [];
let improved = 0;

for (const [file, count] of Object.entries(counts)) {
  const allowed = baseline[file] ?? 0;
  if (count > allowed) regressions.push(`${file}: ${count} raw values, baseline allows ${allowed} (e.g. ${samples[file].join(", ")})`);
}
for (const [file, allowed] of Object.entries(baseline)) {
  if ((counts[file] ?? 0) < allowed) improved += 1;
}

if (regressions.length > 0) {
  console.error("Raw px/colour values must come from the scale in app.css:\n");
  for (const line of regressions) console.error("  " + line);
  console.error("\nUse a --space-*/--fs-*/--radius-* token, or run `npm run check:css -- --write` if the baseline is genuinely wrong.");
  process.exit(1);
}

if (improved > 0) console.log(`${improved} file(s) now cleaner than the baseline; run \`npm run check:css -- --write\` to lock it in.`);
console.log(`css scale ok (${Object.values(counts).reduce((sum, n) => sum + n, 0)} raw values left across ${Object.keys(counts).length} files)`);
