import { describe, it, expect } from "vitest";
import { failuresIn, isPlaywrightInspectorArtifact } from "./logCollector.js";
import type { LogEvent } from "./logCollector.js";

describe("isPlaywrightInspectorArtifact", () => {
  it("matches Playwright's exact Node inspector detach lines", () => {
    expect(isPlaywrightInspectorArtifact("Debugger ending on ws://127.0.0.1:51862/1d7fe869-9e95-401d-9119-a637fc42059a")).toBe(true);
    expect(isPlaywrightInspectorArtifact("For help, see: https://nodejs.org/en/docs/inspector")).toBe(true);
  });

  it("does not match a real error that merely shares words with the detach lines", () => {
    expect(isPlaywrightInspectorArtifact("Debugger ending on ws://127.0.0.1:51862 due to an uncaught exception in main.ts")).toBe(false);
    expect(isPlaywrightInspectorArtifact("Uncaught TypeError: cannot read property 'x' of undefined - for help, see docs/inspector")).toBe(false);
    expect(isPlaywrightInspectorArtifact("sidecar failed to stay up: for help, see https://nodejs.org/en/docs/inspector and retry")).toBe(false);
    expect(isPlaywrightInspectorArtifact("For help, see: https://nodejs.org/en/docs/inspector and also check the logs")).toBe(false);
  });
});

describe("failuresIn", () => {
  it("filters out exactly the Playwright inspector-detach pair", () => {
    const events: LogEvent[] = [
      { source: "main", level: "error", text: "Debugger ending on ws://127.0.0.1:51862/1d7fe869-9e95-401d-9119-a637fc42059a" },
      { source: "main", level: "error", text: "For help, see: https://nodejs.org/en/docs/inspector" },
    ];
    expect(failuresIn(events)).toEqual([]);
  });

  // Adversarial proof the filter is not a hole: a real main-process error that starts
  // exactly like the filtered line, and a wholly unrelated one, must both still fail.
  it("still fails on a fabricated main-process error resembling the filtered line", () => {
    const injected: LogEvent = {
      source: "main",
      level: "error",
      text: "Debugger ending on ws://127.0.0.1:51862/1d7fe869-9e95-401d-9119-a637fc42059a but proxyDaemon crashed",
    };
    expect(failuresIn([injected])).toEqual([injected]);
  });

  it("still fails on an unrelated main-process error", () => {
    const injected: LogEvent = { source: "main", level: "error", text: "proxy autostart failed: ECONNREFUSED" };
    expect(failuresIn([injected])).toEqual([injected]);
  });

  it("still fails on console errors, page errors, and any sidecar line", () => {
    const events: LogEvent[] = [
      { source: "console", level: "error", text: "TypeError: x is not a function" },
      { source: "pageerror", level: "error", text: "ReferenceError: y is not defined" },
      { source: "sidecar", level: "log", text: "[sidecar] started" },
    ];
    expect(failuresIn(events)).toEqual(events);
  });
});
