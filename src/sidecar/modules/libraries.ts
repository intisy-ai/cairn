import { pluginHomes } from "../lib/pluginHomes.js";
import { loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import type { HomeLibraries, PluginHome, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

type HomeReading = Pick<HomeLibraries, "shared" | "plugins">;

const EMPTY: HomeReading = { shared: [], plugins: [] };

export interface LibrariesDeps {
  homes?: () => Promise<PluginHome[]>;
  read?: (dir: string) => Promise<HomeReading>;
  remove?: (dir: string, specifier: string) => Promise<{ removed: boolean; usedBy: string[] }>;
}

// Reading a home's store is plugin-updater's job because it is the thing that fills it.
// Without the engine there is nothing to report rather than an error: every other library
// feature is unavailable in that build too.
async function readHome(dir: string): Promise<HomeReading> {
  try {
    const index = await loadPluginUpdaterIndex();
    return index ? index.homeLibraries(dir) : EMPTY;
  } catch {
    return EMPTY;
  }
}

// Removes a shared library from one home. plugin-updater refuses while a plugin declares it and
// says which, so the answer names the blockers rather than failing blankly: the caller's next
// step is uninstalling those plugins.
export async function librariesRemove(homeId: string, specifier: string, deps: LibrariesDeps = {}): Promise<Result<void>> {
  try {
    const homes = await (deps.homes ?? pluginHomes)();
    const home = homes.find((candidate) => candidate.id === homeId);
    if (!home) return err(`unknown home: ${homeId}`);

    const remove = deps.remove ?? (async (dir: string, name: string) => {
      const index = await loadPluginUpdaterIndex();
      if (!index) throw new Error("the plugin manager is not part of this build");
      return index.removeLibrary(dir, name);
    });

    const result = await remove(home.dir, specifier);
    if (result.removed) return ok(undefined);
    if (result.usedBy.length > 0) return err(`${specifier} is still used by ${result.usedBy.join(", ")}`);
    return err(`${specifier} is not installed in ${home.label}`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function librariesList(deps: LibrariesDeps = {}): Promise<Result<HomeLibraries[]>> {
  try {
    const homes = await (deps.homes ?? pluginHomes)();
    const read = deps.read ?? readHome;
    return ok(await Promise.all(homes.map(async (home) => ({ home, ...await read(home.dir) }))));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
