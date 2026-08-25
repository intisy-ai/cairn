import type { PluginHome, PluginHomeId, Result, ScreenData, InvokeResult } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeById } from "../lib/pluginHomes.js";
import { capabilityOfPlugin, callHostCapability, DEFAULT_CALL_TIMEOUT_MS, DEFAULT_INVOKE_TIMEOUT_MS } from "../lib/pluginHost.js";
import { SCREENS } from "@intisy-ai/core";
import { wrap } from "../result.js";

/** What a plugin providing `screens` answers with. */
interface ScreensCapabilityLike {
  read: (request: { screenId: string; home: string }) => Promise<ScreenData>;
  invoke: (request: { screenId: string; actionId: string; home: string; input: Record<string, unknown> }) => Promise<InvokeResult>;
}

export interface ScreensDeps {
  homes?: PluginHome[];
}

async function screensOf(plugin: string, homeId: string, deps: ScreensDeps): Promise<{ capability: ScreensCapabilityLike; home: PluginHome }> {
  const homes = deps.homes ?? (await pluginHomes());
  const home = homeById(homeId as PluginHomeId, homes);
  const capability = (await capabilityOfPlugin(home.dir, home.id, plugin, SCREENS.id)) as ScreensCapabilityLike | undefined;
  if (!capability) throw new Error(`${plugin} contributes no screens in ${home.label}`);
  return { capability, home };
}

export function screenData(plugin: string, screenId: string, homeId: string, deps: ScreensDeps = {}): Promise<Result<ScreenData>> {
  return wrap(async () => {
    const { capability, home } = await screensOf(plugin, homeId, deps);
    const answer = await callHostCapability(plugin, "screens.read", DEFAULT_CALL_TIMEOUT_MS, async () =>
      capability.read({ screenId, home: home.dir }));
    if (answer.ok === false) throw new Error(answer.error.detail);
    return { sources: answer.value?.sources ?? {} };
  });
}

/**
 * Runs one of a screen's actions.
 *
 * @remarks
 * The invoke budget, not the read one: an action may do real work such as a multi-file restore, and
 * a read-length deadline would abandon it mid-write. The screen id travels with the action id
 * because a capability's `invoke` is per screen, and an action that reaches its plugin without the
 * value its surface was meant to collect is how a restore once ran against the git index.
 */
export function screenInvoke(
  plugin: string,
  screenId: string,
  actionId: string,
  homeId: string,
  args: Record<string, unknown>,
  deps: ScreensDeps = {},
): Promise<Result<InvokeResult>> {
  return wrap(async () => {
    const { capability, home } = await screensOf(plugin, homeId, deps);
    const answer = await callHostCapability(plugin, "screens.invoke", DEFAULT_INVOKE_TIMEOUT_MS, async () =>
      capability.invoke({ screenId, actionId, home: home.dir, input: args }));
    if (answer.ok === false) return { ok: false, message: answer.error.detail };
    return answer.value ?? { ok: false, message: "the plugin returned no result" };
  });
}
