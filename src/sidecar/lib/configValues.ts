import { existsSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * A plugin's on-disk settings, read fresh every call.
 *
 * @remarks
 * Same preference order as core's own config reader: the config subdir wins, the home root is the
 * fallback. Never cached, so a write is visible on the very next read with nothing to invalidate.
 */
export function readCurrentValues(dir: string, plugin: string): Record<string, unknown> {
  const base = resolve(dir);
  for (const candidate of [join(dir, "config", `${plugin}.json`), join(dir, `${plugin}.json`)]) {
    const file = resolve(candidate);
    if (!file.startsWith(base + sep)) continue;
    try {
      if (!existsSync(file)) continue;
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch { /* an unreadable config means no values, never a crash */ }
  }
  return {};
}
