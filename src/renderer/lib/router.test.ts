import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { router, navigate, consumeParams, SCREENS } from "./router.js";

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

  it("navigate with params stores them and consumeParams exposes them once", () => {
    navigate("appsPlugins", { home: "cairn", filter: "provider" });
    expect(get(router).screen).toBe("appsPlugins");
    expect(get(router).params).toEqual({ home: "cairn", filter: "provider" });

    const params = consumeParams();
    expect(params).toEqual({ home: "cairn", filter: "provider" });

    const secondCall = consumeParams();
    expect(secondCall).toBeUndefined();
    expect(get(router).params).toBeUndefined();
  });

  it("navigate without params clears any prior params", () => {
    navigate("appsPlugins", { home: "cairn" });
    expect(get(router).params).toEqual({ home: "cairn" });

    navigate("overview");
    expect(get(router).params).toBeUndefined();
  });
});
