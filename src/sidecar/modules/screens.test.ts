import { describe, it, expect, vi } from "vitest";
import { screenData, screenInvoke } from "./screens.js";

const HOMES = [{ id: "claude", label: "Claude", dir: "/homes/claude", present: true, hasUpdater: true }] as never;

describe("screenData", () => {
  it("passes the screen id and the home's directory to the bundle", async () => {
    const run = vi.fn(async () => ({ sources: { history: [] } }));
    await screenData("config-ledger", "config", "claude", { homes: HOMES, run });
    expect(run).toHaveBeenCalledWith(expect.stringContaining("config-ledger"), ["ui", "data", "config", "--home", "/homes/claude"], 10000);
  });

  it("returns the bundle's sources", async () => {
    const run = async () => ({ sources: { history: [{ id: "a1" }] } });
    const result = await screenData("config-ledger", "config", "claude", { homes: HOMES, run });
    expect(result).toEqual({ ok: true, data: { sources: { history: [{ id: "a1" }] } } });
  });

  it("reports a bundle that answers with nothing as empty sources, not as a crash", async () => {
    const run = async () => null;
    expect(await screenData("config-ledger", "config", "claude", { homes: HOMES, run })).toEqual({ ok: true, data: { sources: {} } });
  });

  it("carries the bundle's own stderr into the error", async () => {
    const run = async () => { throw new Error("Error: not a git repository"); };
    const result = await screenData("config-ledger", "config", "claude", { homes: HOMES, run });
    expect(result).toEqual({ ok: false, error: "Error: not a git repository" });
  });

  it("rejects an unknown home instead of spawning", async () => {
    const run = vi.fn();
    const result = await screenData("config-ledger", "config", "nope", { homes: HOMES, run });
    expect(result.ok).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("screenInvoke", () => {
  it("passes the action id and the arguments as one JSON string", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    await screenInvoke("config-ledger", "commit", "claude", { reason: "note" }, { homes: HOMES, run });
    expect(run).toHaveBeenCalledWith(
      expect.stringContaining("config-ledger"),
      ["ui", "invoke", "commit", "--home", "/homes/claude", "--args", '{"reason":"note"}'],
      600000,
    );
  });

  it("returns the bundle's verdict, including a refusal", async () => {
    const run = async () => ({ ok: false, message: "uncommitted config changes", refresh: true });
    const result = await screenInvoke("config-ledger", "profileSwitch", "claude", { id: "work" }, { homes: HOMES, run });
    expect(result).toEqual({ ok: true, data: { ok: false, message: "uncommitted config changes", refresh: true } });
  });

  it("treats an unparseable answer as a failed action", async () => {
    const run = async () => null;
    const result = await screenInvoke("config-ledger", "commit", "claude", {}, { homes: HOMES, run });
    expect(result).toEqual({ ok: true, data: { ok: false, message: "the plugin returned no result" } });
  });
});
