import { describe, it, expect } from "vitest";
import { wrap } from "./result.js";
describe("wrap", () => {
  it("maps a throw to {ok:false}", async () => {
    expect(await wrap(async () => { throw new Error("boom"); })).toEqual({ ok: false, error: "boom" });
  });
  it("wraps a value in {ok:true}", async () => {
    expect(await wrap(async () => 5)).toEqual({ ok: true, data: 5 });
  });
});
