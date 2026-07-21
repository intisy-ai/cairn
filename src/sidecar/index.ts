import type { Result } from "../../packages/shared/src/domain.js";
import { err } from "./result.js";
import { configGet, configSet } from "./modules/config.js";
import { overviewSummary } from "./modules/overview.js";
import { accountsList, accountsEnable, accountsRemove, accountsRefreshQuota } from "./modules/accounts.js";
import { providersList, providersSetActive, providersSetExposure } from "./modules/providers.js";

type SidecarRequest = { id: number; channel: string; args: unknown[] };
type SidecarResponse = { id: number; result: Result<unknown> };

type SidecarHandler = (...args: unknown[]) => Promise<Result<unknown>>;

const handlers: Record<string, SidecarHandler> = {};

export function registerHandler(channel: string, handler: SidecarHandler): void {
  handlers[channel] = handler;
}

export async function dispatch(channel: string, args: unknown[]): Promise<Result<unknown>> {
  const handler = handlers[channel];
  if (!handler) return err(`no handler registered for channel: ${channel}`);
  try {
    return await handler(...args);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

registerHandler("config:get", (name, key) => configGet(name as string, key as string));
registerHandler("config:set", (name, key, value) => configSet(name as string, key as string, value));
registerHandler("overview:summary", () => overviewSummary());
registerHandler("accounts:list", (provider) => accountsList(provider as string));
registerHandler("accounts:enable", (provider, id, on) => accountsEnable(provider as string, id as string, on as boolean));
registerHandler("accounts:remove", (provider, id) => accountsRemove(provider as string, id as string));
registerHandler("accounts:refreshQuota", (provider) => accountsRefreshQuota(provider as string));
registerHandler("providers:list", () => providersList());
registerHandler("providers:setActive", (id) => providersSetActive(id as string));
registerHandler("providers:setExposure", (id, app, on) => providersSetExposure(id as string, app as "cc" | "oc", on as boolean));

if (process.parentPort) {
  process.parentPort.on("message", (messageEvent) => {
    const { id, channel, args } = messageEvent.data as SidecarRequest;
    dispatch(channel, args).then((result) => {
      const response: SidecarResponse = { id, result };
      process.parentPort.postMessage(response);
    });
  });
}
