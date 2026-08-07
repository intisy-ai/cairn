import { describe, it, expect } from "vitest";
import { parseWorkerPhase } from "./workerPhase.js";

describe("parseWorkerPhase", () => {
  // An update reported one percentage and then nothing for the whole install and build, so
  // the bar sat still for minutes. These are the manager's own log lines.
  it("reads the stage the manager reported", () => {
    expect(parseWorkerPhase("[2026-08-06T10:00:00.000Z] [INFO] Running npm install for wakatime-sync"))
      .toMatchObject({ phase: "installing dependencies" });
    expect(parseWorkerPhase("[INFO] Finished npm run build for wakatime-sync")).toMatchObject({ phase: "built" });
    expect(parseWorkerPhase("[INFO] Running copy for wakatime-sync")).toMatchObject({ phase: "deploying" });
  });

  it("takes the last stage in a chunk that carries several", () => {
    const chunk = ["[INFO] Running npm install for x", "[INFO] Finished npm install for x", "[INFO] Running npm run build for x"].join("\n");
    expect(parseWorkerPhase(chunk)).toMatchObject({ phase: "building" });
  });

  it("moves forward through the stages so the bar never goes backwards", () => {
    const order = ["Running npm install", "Finished npm install", "Running npm run build", "Finished npm run build", "Running copy", "Finished copy"];
    const percents = order.map((line) => parseWorkerPhase(`[INFO] ${line} for x`)!.percent);
    expect(percents).toEqual([...percents].sort((a, b) => a - b));
  });

  it("says nothing about a line that is not a stage", () => {
    expect(parseWorkerPhase("[INFO] Skipping install/build for x (no changes and deployed file exists)")).toBeUndefined();
    expect(parseWorkerPhase("")).toBeUndefined();
    expect(parseWorkerPhase("Receiving objects:  45% (450/1000), 1.20 MiB | 3.40 MiB/s")).toBeUndefined();
  });

  // Deleting a clone's node_modules is the slow part of an uninstall, and it used to sit at
  // one percentage for the whole of it.
  describe("a removal", () => {
    it("reads its own stages", () => {
      expect(parseWorkerPhase("[INFO] Uninstalled plugin wakatime-sync", "remove")).toMatchObject({ phase: "deregistered" });
      expect(parseWorkerPhase("[INFO] Removing repos/wakatime-sync", "remove")).toMatchObject({ phase: "removing files" });
      expect(parseWorkerPhase("[INFO] Pruned orphaned repos/wakatime-sync", "remove")).toMatchObject({ phase: "files removed" });
      expect(parseWorkerPhase("[INFO] Pruned orphaned plugin/wakatime-sync.js", "remove")).toMatchObject({ phase: "artifact removed" });
    });

    it("moves forward so the bar never goes backwards", () => {
      const order = ["Uninstalled plugin x", "Removing repos/x", "Pruned orphaned repos/x", "Pruned orphaned plugin/x.js"];
      const percents = order.map((line) => parseWorkerPhase(`[INFO] ${line}`, "remove")!.percent);
      expect(percents).toEqual([...percents].sort((a, b) => a - b));
    });

    // The manager prunes during an install too. Reading those lines there would jump an
    // install's bar to nearly done because something unrelated was tidied up.
    it("keeps its stages out of an install", () => {
      expect(parseWorkerPhase("[INFO] Pruned orphaned repos/something-else", "install")).toBeUndefined();
      expect(parseWorkerPhase("[INFO] Removing repos/something-else")).toBeUndefined();
    });

    it("ignores the install stages, which a removal never runs", () => {
      expect(parseWorkerPhase("[INFO] Running npm install for x", "remove")).toBeUndefined();
    });
  });
});
