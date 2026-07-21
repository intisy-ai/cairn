import type { Result } from "../../packages/shared/src/domain.js";
import { err } from "./result.js";

type SidecarRequest = { id: number; channel: string; args: unknown[] };
type SidecarResponse = { id: number; result: Result<unknown> };

export const hubConfigDir = process.env.HUB_CONFIG_DIR;

const handlers: Record<string, (...args: unknown[]) => Promise<Result<unknown>>> = {};

async function dispatch(channel: string, args: unknown[]): Promise<Result<unknown>> {
  const handler = handlers[channel];
  return handler ? handler(...args) : err(`no handler registered for channel: ${channel}`);
}

if (process.parentPort) {
  process.parentPort.on("message", (messageEvent) => {
    const { id, channel, args } = messageEvent.data as SidecarRequest;
    dispatch(channel, args).then((result) => {
      const response: SidecarResponse = { id, result };
      process.parentPort.postMessage(response);
    });
  });
}
