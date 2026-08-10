import { getConfigValue } from "@core/index.js";
import { loadPluginUpdaterIndex } from "../lib/optionalEngines.js";

const CONFIG_NAME = "cairn";
const CONFIG_KEY = "pruneUnusedLibraries";

// Uninstalling a plugin leaves the libraries it put in the home's shared store behind. That is
// how a home came to keep offering a wire format after the only plugin that used it was gone.
// On by default, because a library nothing declares is dead weight that still answers "what is
// installed"; switchable off for a home that installs libraries by hand.
export function prunesUnusedLibraries(): boolean {
  return getConfigValue(CONFIG_NAME, CONFIG_KEY) !== false;
}

export interface PruneDeps {
  enabled?: () => boolean;
  orphans?: (dir: string) => string[];
  remove?: (dir: string, specifier: string) => void;
}

// Removes every library in this home's store that no installed plugin declares any more.
// Returns what went, so the caller can say so rather than silently changing the home.
export async function pruneUnusedLibraries(dir: string, deps: PruneDeps = {}): Promise<string[]> {
  if (!(deps.enabled ?? prunesUnusedLibraries)()) return [];

  const index = deps.orphans && deps.remove ? null : await loadPluginUpdaterIndex();
  const orphans = deps.orphans ?? ((home: string) => index?.orphanedLibraries(home) ?? []);
  const remove = deps.remove ?? ((home: string, specifier: string) => { index?.removeLibrary(home, specifier); });

  const removed: string[] = [];
  for (const specifier of orphans(dir)) {
    try {
      remove(dir, specifier);
      removed.push(specifier);
    } catch {
      // A library that will not delete (held open on Windows, say) is not worth failing the
      // uninstall that already succeeded over.
    }
  }
  return removed;
}
