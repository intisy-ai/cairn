import { describe, it, expect } from "vitest";
import { IPC_CHANNELS } from "./ipc.js";

describe("shared IPC contract", () => {
  it("declares disjoint invoke/send/receive channel lists", () => {
    const { invoke, send, receive } = IPC_CHANNELS;
    const all = [...invoke, ...send, ...receive];
    expect(new Set(all).size).toBe(all.length); // no channel appears in two directions
    expect(invoke).toContain("config:get");
  });
});
