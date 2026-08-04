import { describe, it, expect } from "vitest";
import { dispatch, registerHandler } from "./index.js";
import { ok } from "./result.js";
import { currentCause } from "@core/index.js";

describe("dispatch", () => {
  it("resolves to {ok:false} when the handler throws", async () => {
    registerHandler("throws", async () => {
      throw new Error("boom");
    });
    expect(await dispatch("throws", [])).toEqual({ ok: false, error: "boom" });
  });

  it("resolves to the handler's own Result without double-nesting", async () => {
    registerHandler("succeeds", async (x) => ok(x));
    expect(await dispatch("succeeds", [5])).toEqual({ ok: true, data: 5 });
  });

  it("runs every handler inside a user cause naming its channel", async () => {
    let seen: { kind: string; surface?: string } | null = null;
    registerHandler("probes-cause", async () => { seen = currentCause(); return ok(null); });

    expect(await dispatch("probes-cause", [])).toEqual({ ok: true, data: null });
    expect(seen).not.toBeNull();
    expect((seen as unknown as { kind: string }).kind).toBe("user");
    expect((seen as unknown as { surface?: string }).surface).toBe("probes-cause");
  });
});
