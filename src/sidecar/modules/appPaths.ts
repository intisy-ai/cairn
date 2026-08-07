import { getAppDescriptor, setAppPaths, appPaths, resolveHome, moveAppPaths, movesFailed, validatePathNames, DEFAULT_PATH_NAMES } from "@core/index.js";
import type { AppPathNames, AppStorage, AppStorageResult, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

export interface AppPathsDeps {
  describe?: typeof getAppDescriptor;
  homeOf?: (app: string) => string;
  move?: typeof moveAppPaths;
  save?: (id: string, names: AppPathNames) => void;
}

function homeFor(app: string): string {
  const desc = getAppDescriptor(app);
  return desc ? resolveHome(desc) : "";
}

export function appStorageGet(app: string, deps: AppPathsDeps = {}): Promise<Result<AppStorage>> {
  return Promise.resolve().then(() => {
    const desc = (deps.describe ?? getAppDescriptor)(app);
    if (!desc) return err(`unknown app: ${app}`);
    const dir = (deps.homeOf ?? homeFor)(app);
    return ok({ app, home: dir, names: desc.paths, defaults: DEFAULT_PATH_NAMES, resolved: appPaths(dir, desc) });
  });
}

// The registry is written only once the directories are actually where the new names say
// they are. Writing first and moving after would leave an app pointed at storage that was
// never renamed, which reads as every plugin having vanished.
export function appStorageSet(app: string, names: AppPathNames, deps: AppPathsDeps = {}): Promise<Result<AppStorageResult>> {
  return Promise.resolve().then(() => {
    const desc = (deps.describe ?? getAppDescriptor)(app);
    if (!desc) return err(`unknown app: ${app}`);

    const errors = validatePathNames(names);
    const firstError = Object.entries(errors)[0];
    if (firstError) return err(`${firstError[0]} ${firstError[1]}`);

    const dir = (deps.homeOf ?? homeFor)(app);
    if (!dir) return err(`no home for app: ${app}`);

    const moves = (deps.move ?? moveAppPaths)(dir, desc.paths, names);
    const failed = movesFailed(moves);
    if (failed.length > 0) {
      const move = failed[0];
      return err(move.status === "target-exists"
        ? `${move.kind}: ${move.to} already exists in this home`
        : `${move.kind}: could not move ${move.from} to ${move.to}${move.detail ? ` (${move.detail})` : ""}`);
    }

    try {
      (deps.save ?? setAppPaths)(app, names);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
    return ok({ names, moves });
  });
}
