import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadProviderDef } from "./providerDef.js";

const stubHandlerPath = fileURLToPath(new URL("../../../../../providers/stub-auth/dist/handler.js", import.meta.url));

describe("loadProviderDef", () => {
  it("reads the def export off a built provider handler", async () => {
    const def = await loadProviderDef(stubHandlerPath);
    expect(def).not.toBeNull();
    expect(def?.id).toBe("stub");
    expect(typeof def?.label).toBe("string");
    expect(def?.hasOAuth).toBe(true);
  });

  it("returns null when the handler path does not exist", async () => {
    const def = await loadProviderDef(fileURLToPath(new URL("./does-not-exist.js", import.meta.url)));
    expect(def).toBeNull();
  });
});
