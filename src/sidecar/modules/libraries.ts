import { pluginHomes } from "../lib/pluginHomes.js";
import { invokeLibraryManagement, readLibraryManagement } from "../lib/pluginManager.js";
import type { HomeLibraries, PluginHome, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

type HomeReading = Pick<HomeLibraries, "shared" | "plugins">;

const EMPTY: HomeReading = { shared: [], plugins: [] };

export interface LibrariesDeps {
  homes?: () => Promise<PluginHome[]>;
  read?: (dir: string, appId: string) => Promise<HomeReading>;
  remove?: (dir: string, specifier: string, appId: string) => Promise<{ removed: boolean; usedBy: string[] }>;
}

// Reading a home's store belongs to whatever fills it, which is why this asks the home rather than
// naming a manager. A home with nothing providing it has nothing to report rather than an error:
// every other library feature is unavailable there too.
function readHome(dir: string, appId: string): Promise<HomeReading> {
  return readLibraryManagement(dir, appId, "libraries", EMPTY, (capability) => capability.libraries());
}

// Removes a shared library from one home. The manager refuses while a plugin declares it and says
// which, so the answer names the blockers rather than failing blankly: the caller's next step is
// uninstalling those plugins.
export async function librariesRemove(homeId: string, specifier: string, deps: LibrariesDeps = {}): Promise<Result<void>> {
  try {
    const homes = await (deps.homes ?? pluginHomes)();
    const home = homes.find((candidate) => candidate.id === homeId);
    if (!home) return err(`unknown home: ${homeId}`);

    const remove = deps.remove ?? ((dir: string, name: string, appId: string) =>
      invokeLibraryManagement(dir, appId, "remove", null, (capability) => capability.remove(name)));

    const result = await remove(home.dir, specifier, home.id);
    if (!result) return err(`${home.label} has nothing managing its libraries`);
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
    return ok(await Promise.all(homes.map(async (home) => ({ home, ...await read(home.dir, home.id) }))));
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
