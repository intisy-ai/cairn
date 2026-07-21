import type { Result } from "../../packages/shared/src/domain.js";
import { err } from "./result.js";
import { configGet, configSet } from "./modules/config.js";

type SidecarRequest = { id: number; channel: string; args: unknown[] };
type SidecarResponse = { id: number; result: Result<unknown> };

export const hubConfigDir = process.env.HUB_CONFIG_DIR;

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

if (process.parentPort) {
  process.parentPort.on("message", (messageEvent) => {
    const { id, channel, args } = messageEvent.data as SidecarRequest;
    dispatch(channel, args).then((result) => {
      const response: SidecarResponse = { id, result };
      process.parentPort.postMessage(response);
    });
  });
}
