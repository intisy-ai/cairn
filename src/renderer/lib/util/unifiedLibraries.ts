import type { HomeLibraries, PluginHome, UnifiedLibrary } from "@cairn/shared";

// One row per library rather than one per home. A library installed in three homes was listed
// three times, which read as three libraries; the homes belong beside it, the way a plugin's do.
//
// A version is kept per home because they genuinely can differ, and a row that showed one
// version would be claiming something it cannot know.
export function buildUnifiedLibraries(homes: HomeLibraries[]): UnifiedLibrary[] {
  const bySpecifier = new Map<string, UnifiedLibrary>();

  function entryFor(specifier: string): UnifiedLibrary {
    let entry = bySpecifier.get(specifier);
    if (!entry) {
      entry = { specifier, homes: {}, usedBy: [], declaredBy: [] };
      bySpecifier.set(specifier, entry);
    }
    return entry;
  }

  for (const home of homes) {
    for (const library of home.shared) {
      const entry = entryFor(library.specifier);
      entry.homes[home.home.id] = { version: library.version, installed: true };
      for (const plugin of library.usedBy) {
        if (!entry.usedBy.includes(plugin)) entry.usedBy.push(plugin);
      }
    }
    // A plugin's own declared dependency is not in the shared store, so it is recorded as a
    // declaration rather than an installation: the row still names it, and still says nobody
    // put it in the store.
    for (const group of home.plugins) {
      for (const library of group.dependencies) {
        const entry = entryFor(library.specifier);
        if (!entry.declaredBy.includes(group.plugin)) entry.declaredBy.push(group.plugin);
        if (!entry.usedBy.includes(group.plugin)) entry.usedBy.push(group.plugin);
        if (!entry.homes[home.home.id]) entry.homes[home.home.id] = { version: library.version, installed: false };
      }
    }
  }

  for (const entry of bySpecifier.values()) {
    entry.usedBy.sort();
    entry.declaredBy.sort();
  }
  return [...bySpecifier.values()].sort((a, b) => a.specifier.localeCompare(b.specifier));
}

// A library nothing declares is removable on its own; one in use goes when its consumers do.
export function isOrphan(library: UnifiedLibrary): boolean {
  return library.usedBy.length === 0;
}

export function homeIdsFor(library: UnifiedLibrary, homes: PluginHome[]): string[] {
  return homes.filter((home) => library.homes[home.id]?.installed).map((home) => home.id);
}
