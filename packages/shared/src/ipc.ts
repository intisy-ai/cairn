export const IPC_CHANNELS = {
  invoke: [
    "config:get",
    "config:set",
    "overview:summary",
    "accounts:list",
    "accounts:enable",
    "accounts:remove",
    "accounts:refreshQuota",
  ] as const,
  send: ["window:minimize", "window:maximize", "window:close"] as const,
  receive: ["server:status", "provider:updated"] as const,
};
export type InvokeChannel = (typeof IPC_CHANNELS.invoke)[number];
