import { describe, it, expect } from "vitest";
import { parseGitProgress, toBytes } from "./gitProgress.js";
import { formatBytes, formatRate } from "../../../packages/shared/src/bytes.js";

describe("parseGitProgress", () => {
  it("reads the stage, percent, byte count and rate from a receiving line", () => {
    expect(parseGitProgress("Receiving objects:  45% (450/1000), 1.20 MiB | 3.40 MiB/s")).toEqual({
      stage: "Receiving objects",
      percent: 45,
      bytes: 1258291,
      bytesPerSecond: 3565158,
    });
  });

  it("reads a stage that reports no transfer, like delta resolution", () => {
    expect(parseGitProgress("Resolving deltas:  80% (800/1000)")).toEqual({ stage: "Resolving deltas", percent: 80 });
  });

  // git rewrites one line in place with \r, so a single chunk carries many updates.
  it("takes the most recent update from a carriage-return rewritten chunk", () => {
    const chunk = "Receiving objects:  10% (100/1000), 200.00 KiB\rReceiving objects:  90% (900/1000), 4.00 MiB | 2.00 MiB/s\r";
    expect(parseGitProgress(chunk)).toMatchObject({ percent: 90, bytes: 4194304, bytesPerSecond: 2097152 });
  });

  it("handles a real clone transcript, ending on the last stage reported", () => {
    const transcript = [
      "Cloning into 'plugin-updater'...",
      "remote: Enumerating objects: 1200, done.",
      "remote: Counting objects:  100% (1200/1200), done.",
      "Receiving objects:  50% (600/1200), 2.50 MiB | 5.00 MiB/s",
      "Receiving objects: 100% (1200/1200), 5.10 MiB | 5.00 MiB/s, done.",
      "Resolving deltas: 100% (400/400), done.",
    ].join("\n");
    expect(parseGitProgress(transcript)).toMatchObject({ stage: "Resolving deltas", percent: 100 });
  });

  it("caps a percent above 100 rather than reporting an impossible number", () => {
    expect(parseGitProgress("Receiving objects: 120% (1/1)")?.percent).toBe(100);
  });

  it("returns nothing for output that carries no progress", () => {
    expect(parseGitProgress("Cloning into 'x'...\nremote: Enumerating objects: 12, done.")).toBeUndefined();
    expect(parseGitProgress("")).toBeUndefined();
  });

  it("understands decimal and binary units alike", () => {
    expect(toBytes(1, "KiB")).toBe(1024);
    expect(toBytes(1, "kB")).toBe(1000);
    expect(toBytes(2, "MiB")).toBe(2097152);
    expect(toBytes(1, "furlongs")).toBeUndefined();
  });
});

describe("formatting", () => {
  it("scales bytes to a readable unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3.00 GB");
  });

  it("renders a rate per second", () => {
    expect(formatRate(1024 ** 2)).toBe("1.0 MB/s");
  });
});
