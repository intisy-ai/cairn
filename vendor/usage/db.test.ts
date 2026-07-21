import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { openDB, readJSON } from "./db.js";

// A static `import ... from "node:sqlite"` gets mis-resolved by Vite's browser
// condition (used elsewhere in this project for Svelte component tests), which
// strips the "node:" prefix before checking Node's builtin module list. Using
// createRequire for this one dynamic lookup sidesteps Vite's static analysis.
// @types/node in this project predates node:sqlite's typings, hence the local shape.
interface TestSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): void; all(): unknown[] };
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: new (path: string) => TestSqliteDatabase;
};

const savedEnv = {
  OPENCODE_DIR: process.env.OPENCODE_DIR,
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  HUB_OPENCODE_DATA_DIR: process.env.HUB_OPENCODE_DATA_DIR,
};

let tempDir: string;

// openDB() always falls through to defaultDbPath() as a last resort, which
// reads real user data if this machine happens to have a db at
// ~/.local/share/opencode/opencode.db, so every test pins that fallback to an
// empty temp dir via HUB_OPENCODE_DATA_DIR too.
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vendor-usage-db-"));
  delete process.env.OPENCODE_DIR;
  delete process.env.LOCALAPPDATA;
  process.env.HUB_OPENCODE_DATA_DIR = join(tempDir, "no-default-db-here");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  for (const key of ["OPENCODE_DIR", "LOCALAPPDATA", "HUB_OPENCODE_DATA_DIR"] as const) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("readJSON", () => {
  it("returns null for a missing file", () => {
    expect(readJSON(join(tempDir, "missing.json"))).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const p = join(tempDir, "bad.json");
    writeFileSync(p, "{not json", "utf-8");
    expect(readJSON(p)).toBeNull();
  });

  it("parses valid JSON", () => {
    const p = join(tempDir, "good.json");
    writeFileSync(p, JSON.stringify({ a: 1, b: "two" }), "utf-8");
    expect(readJSON<{ a: number; b: string }>(p)).toEqual({ a: 1, b: "two" });
  });
});

describe("openDB", () => {
  it("returns null when no candidate path exists", () => {
    process.env.OPENCODE_DIR = tempDir;
    expect(openDB()).toBeNull();
  });

  it("opens a real sqlite file found via OPENCODE_DIR and can query it", () => {
    process.env.OPENCODE_DIR = tempDir;
    const dbPath = join(tempDir, "opencode.db");
    const setup = new DatabaseSync(dbPath);
    setup.exec("CREATE TABLE session (id TEXT PRIMARY KEY, title TEXT)");
    setup.prepare("INSERT INTO session (id, title) VALUES (?, ?)").run("s1", "hello");
    setup.close();

    const handle = openDB();
    expect(handle).not.toBeNull();
    const rows = handle?.query("SELECT id, title FROM session").all();
    expect(rows).toEqual([{ id: "s1", title: "hello" }]);
    handle?.close();
  });
});
