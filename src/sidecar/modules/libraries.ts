import { pluginHomes } from "../lib/pluginHomes.js";
import { loadPluginUpdaterIndex } from "../lib/optionalEngines.js";
import type { HomeLibraries, PluginHome, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

type HomeReading = Pick<HomeLibraries, "shared" | "plugins">;

const EMPTY: HomeReading = { shared: [], plugins: [] };

export interface LibrariesDeps {
  homes?: () => Promise<PluginHome[]>;
  read?: (dir: string) => Promise<HomeReading>;
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

export async function librariesList(deps: LibrariesDeps = {}): Promise<Result<HomeLibraries[]>> {
  try {
    const homes = await (deps.homes ?? pluginHomes)();
    const read = deps.read ?? readHome;
    return ok(await Promise.all(homes.map(async (home) => ({ home, ...await read(home.dir) }))));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
