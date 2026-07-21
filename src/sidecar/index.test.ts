import { describe, it, expect } from "vitest";
import { dispatch, registerHandler } from "./index.js";
import { ok } from "./result.js";

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
});
