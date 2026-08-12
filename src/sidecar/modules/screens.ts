import { existsSync } from "node:fs";
import { join } from "node:path";
import type { PluginHome, PluginHomeId, Result, ScreenData, InvokeResult } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeById } from "../lib/pluginHomes.js";
import { pluginDir } from "../lib/storagePaths.js";
import { safeGetPlugins } from "../lib/optionalEngines.js";
import { runUi, UI_DATA_TIMEOUT_MS, UI_INVOKE_TIMEOUT_MS } from "../lib/uiProbe.js";
import { wrap } from "../result.js";

export interface ScreensDeps {
  homes?: PluginHome[];
  run?: (bundlePath: string, argv: string[], timeoutMs: number) => Promise<unknown>;
  listPlugins?: (dir: string) => Promise<{ name: string }[]>;
  bundleExists?: (bundlePath: string) => boolean;
}

interface Target {
  dir: string;
  bundle: string;
}

// The same guards configAction runs before spawning: an unregistered plugin or a missing
// bundle would otherwise surface as a raw "module not found" from node rather than a clear
// answer naming what went wrong.
async function targetFor(plugin: string, homeId: string, deps: ScreensDeps): Promise<Target> {
  const homes = deps.homes ?? (await pluginHomes());
  const { dir } = homeById(homeId as PluginHomeId, homes);
  const listPlugins = deps.listPlugins ?? safeGetPlugins;
  if (!(await listPlugins(dir)).some((p) => p.name === plugin)) {
    throw new Error(`plugin not found: ${plugin}`);
  }
  const bundle = join(pluginDir(dir), `${plugin}.js`);
  const bundleExists = deps.bundleExists ?? existsSync;
  if (!bundleExists(bundle)) throw new Error(`plugin bundle not found: ${plugin}`);
  return { dir, bundle };
}

export function screenData(plugin: string, screenId: string, homeId: string, deps: ScreensDeps = {}): Promise<Result<ScreenData>> {
  return wrap(async () => {
    const run = deps.run ?? runUi;
    const { dir, bundle } = await targetFor(plugin, homeId, deps);
    const answer = (await run(bundle, ["ui", "data", screenId, "--home", dir], UI_DATA_TIMEOUT_MS)) as ScreenData | null;
    return { sources: answer?.sources ?? {} };
  });
}

export function screenInvoke(plugin: string, actionId: string, homeId: string, args: Record<string, unknown>, deps: ScreensDeps = {}): Promise<Result<InvokeResult>> {
  return wrap(async () => {
    const run = deps.run ?? runUi;
    const { dir, bundle } = await targetFor(plugin, homeId, deps);
    const answer = (await run(bundle, ["ui", "invoke", actionId, "--home", dir, "--args", JSON.stringify(args)], UI_INVOKE_TIMEOUT_MS)) as InvokeResult | null;
    return answer ?? { ok: false, message: "the plugin returned no result" };
  });
}
