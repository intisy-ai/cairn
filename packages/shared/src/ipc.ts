export const IPC_CHANNELS = {
  invoke: ["config:get", "config:set", "overview:summary"] as const,
  send: ["window:minimize", "window:maximize", "window:close"] as const,
  receive: ["server:status", "provider:updated"] as const,
};
export type InvokeChannel = (typeof IPC_CHANNELS.invoke)[number];
