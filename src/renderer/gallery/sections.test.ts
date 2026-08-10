// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { SECTIONS } from "./sections.js";

describe("gallery sections", () => {
  it("gives every section a unique id", () => {
    const ids = SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // An overlay is position:fixed, so the shot harness cannot measure it from scrollHeight.
  // Without a declared viewport it is captured against a 200px window and clipped to nothing,
  // which is how dialogs went unreviewed.
  it("declares a viewport height for every overlay section", () => {
    const overlays = SECTIONS.filter((section) => section.id.startsWith("overlay-"));
    expect(overlays.length).toBeGreaterThan(0);
    for (const overlay of overlays) {
      expect(overlay.viewportHeight, `${overlay.id} needs a viewportHeight`).toBeGreaterThan(200);
    }
  });

  it("shoots every dialog the app can open on its own", () => {
    const overlays = SECTIONS.filter((section) => section.id.startsWith("overlay-")).map((section) => section.id);
    expect(overlays).toContain("overlay-activity");
    expect(overlays).toContain("overlay-marketplaces");
  });
});
