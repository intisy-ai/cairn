import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { router, navigate, SCREENS } from "./router.js";

describe("router", () => {
  it("defaults to the overview screen", () => {
    expect(get(router).screen).toBe("overview");
  });

  it("updates the screen on navigate", () => {
    navigate("providers");
    expect(get(router).screen).toBe("providers");
    navigate("overview");
    expect(get(router).screen).toBe("overview");
  });

  it("lists every screen exactly once, in a stable order", () => {
    const ids = SCREENS.map((screen) => screen.id);
    expect(ids).toEqual(["overview", "providers", "accounts", "routing", "usage", "localApi", "appsPlugins"]);
  });
});
