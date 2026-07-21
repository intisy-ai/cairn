// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { setTheme, theme } from "./theme.js";

describe("theme", () => {
  it("setTheme(dark) stamps document.documentElement.dataset.theme", () => {
    setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(get(theme)).toBe("dark");
  });

  it("setTheme(light) stamps back to light", () => {
    setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(get(theme)).toBe("light");
  });
});
