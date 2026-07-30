import { describe, it, expect } from "vitest";
import { svgIconDataUri, MAX_ICON_BYTES } from "./pluginIcon.js";

describe("svgIconDataUri", () => {
  it("encodes a logo-sized svg into a base64 data URI", () => {
    const svg = "<svg viewBox='0 0 16 16'/>";
    expect(svgIconDataUri(svg)).toBe("data:image/svg+xml;base64," + Buffer.from(svg, "utf-8").toString("base64"));
  });

  it("drops an icon larger than the cap so the UI falls back to a lettermark", () => {
    const oversized = "<svg>" + "a".repeat(MAX_ICON_BYTES) + "</svg>";
    expect(svgIconDataUri(oversized)).toBeUndefined();
  });
});
