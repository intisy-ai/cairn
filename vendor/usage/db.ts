// Low-level data access: locate + open the OpenCode SQLite db (read-only), and
// a safe JSON reader. node:sqlite is loaded via createRequire rather than a
// static import: it is optional at runtime (older Node/Electron builds don't
// have it) and a static specifier would also be mis-resolved by bundlers that
// apply a browser resolution condition to this file.
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createRequire } from "module";

const requireModule = createRequire(import.meta.url);

// The OpenCode sqlite db lives outside the app home (its default is under
// ~/.local/share, not ~/.config/opencode), so this reader owns its own path
// logic rather than deriving from resolveHome.
function defaultDbPath(): string {
  const forced = process.env.HUB_OPENCODE_DATA_DIR;
  if (forced && forced.trim()) return join(forced.trim(), "opencode.db");
  return join(homedir(), ".local", "share", "opencode", "opencode.db");
}

export interface SqliteRows {
  all(): unknown[];
}

export interface SqliteHandle {
  query(sql: string): SqliteRows;
  close(): void;
}

interface DatabaseSyncCtor {
  new (path: string, options: { readOnly: boolean }): {
    prepare(sql: string): SqliteRows;
    close(): void;
  };
}

function openSqlite(path: string): SqliteHandle | null {
  try {
    const { DatabaseSync } = requireModule("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };
    const db = new DatabaseSync(path, { readOnly: true });
    return { query: (sql: string) => db.prepare(sql), close: () => db.close() };
  } catch {
    return null;
  }
}

export function openDB(): SqliteHandle | null {
  const candidates: string[] = [];
  if (process.env.OPENCODE_DIR) candidates.push(join(process.env.OPENCODE_DIR, "opencode.db"));
  if (process.env.LOCALAPPDATA) candidates.push(join(process.env.LOCALAPPDATA, "opencode", "opencode.db"));
  candidates.push(defaultDbPath());

  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const db = openSqlite(path);
      if (db) return db;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

export function readJSON<T = unknown>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}
