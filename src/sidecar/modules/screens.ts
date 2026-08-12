import { join } from "node:path";
import type { PluginHome, PluginHomeId, Result, ScreenData, InvokeResult } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeById } from "../lib/pluginHomes.js";
import { pluginDir } from "../lib/storagePaths.js";
import { runUi, UI_DATA_TIMEOUT_MS, UI_INVOKE_TIMEOUT_MS } from "../lib/uiProbe.js";
import { wrap } from "../result.js";

export interface ScreensDeps {
  homes?: PluginHome[];
  run?: (bundlePath: string, argv: string[], timeoutMs: number) => Promise<unknown>;
}

interface Target {
  dir: string;
  bundle: string;
}

async function targetFor(plugin: string, homeId: string, deps: ScreensDeps): Promise<Target> {
  const homes = deps.homes ?? (await pluginHomes());
  const { dir } = homeById(homeId as PluginHomeId, homes);
  return { dir, bundle: join(pluginDir(dir), `${plugin}.js`) };
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
