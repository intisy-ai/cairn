import { describe, it, expect } from "vitest";
import { isReadOnlyChannel } from "./ipc.js";

describe("isReadOnlyChannel", () => {
  it("treats a screen data read as read-only", () => {
    expect(isReadOnlyChannel("screens:data")).toBe(true);
  });

  it("treats a screen action invocation as a user action, not read-only", () => {
    expect(isReadOnlyChannel("screens:invoke")).toBe(false);
  });

  it("treats a screen list as read-only", () => {
    expect(isReadOnlyChannel("screens:list")).toBe(true);
  });

  it("treats the plugin ledger and quarantine reads as read-only", () => {
    expect(isReadOnlyChannel("plugins:ledger")).toBe(true);
    expect(isReadOnlyChannel("plugins:quarantine")).toBe(true);
  });
});
