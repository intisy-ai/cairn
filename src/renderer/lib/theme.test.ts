// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import { setTheme, theme, applyThemeSetting } from "./theme.js";

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

function fakeMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];
  const mql = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => listeners.push(cb),
    removeEventListener: (_type: string, cb: (event: MediaQueryListEvent) => void) => {
      const index = listeners.indexOf(cb);
      if (index >= 0) listeners.splice(index, 1);
    },
  } as unknown as MediaQueryList;
  return {
    mql,
    setMatches(next: boolean) {
      matches = next;
      for (const cb of [...listeners]) cb({ matches: next } as MediaQueryListEvent);
    },
    listenerCount: () => listeners.length,
  };
}

describe("applyThemeSetting", () => {
  it("system follows matchMedia immediately and live-updates on change", () => {
    const fake = fakeMatchMedia(false);
    window.matchMedia = vi.fn(() => fake.mql);

    applyThemeSetting("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    fake.setMatches(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("removes the system change listener when switching away from system", () => {
    const fake = fakeMatchMedia(true);
    window.matchMedia = vi.fn(() => fake.mql);

    applyThemeSetting("system");
    expect(fake.listenerCount()).toBe(1);

    applyThemeSetting("light");
    expect(fake.listenerCount()).toBe(0);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("light and dark force the theme without touching matchMedia", () => {
    const matchMediaSpy = vi.fn();
    window.matchMedia = matchMediaSpy;

    applyThemeSetting("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(matchMediaSpy).not.toHaveBeenCalled();
  });
});
