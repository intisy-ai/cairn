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
    expect(ids).toEqual(["overview", "providers", "accounts", "routing", "usage", "localApi", "apps", "plugins", "settings"]);
  });

  it("navigate with params stores them and consumeParams exposes them once", () => {
    navigate("plugins", { add: "1" });
    expect(get(router).screen).toBe("plugins");
    expect(get(router).params).toEqual({ add: "1" });

    const params = consumeParams();
    expect(params).toEqual({ add: "1" });

    const secondCall = consumeParams();
    expect(secondCall).toBeUndefined();
    expect(get(router).params).toBeUndefined();
  });

  it("consumeParams does not notify subscribers when there are no params", () => {
    navigate("plugins");
    let notifications = 0;
    const unsub = router.subscribe(() => notifications++);
    notifications = 0;
    const result = consumeParams();
    unsub();
    expect(result).toBeUndefined();
    expect(notifications).toBe(0);
  });

  it("navigate without params clears any prior params", () => {
    navigate("apps", { app: "claude" });
    expect(get(router).params).toEqual({ app: "claude" });

    navigate("overview");
    expect(get(router).params).toBeUndefined();
  });
});
