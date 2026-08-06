import { describe, it, expect, vi } from "vitest";
import { accountsLoginBegin, accountsLoginComplete, accountsLoginCancel } from "./accountsLogin.js";

function fakeFlow(overrides = {}) {
  return { url: "https://auth.example/go", instructions: "Paste the code", complete: vi.fn(async () => ({ id: "acc1", label: "user@example" })), cancel: vi.fn(), ...overrides };
}

describe("accountsLogin", () => {
  it("begin returns url/instructions and stores the flow", async () => {
    const flow = fakeFlow();
    const res = await accountsLoginBegin("stub", { resolveLoginFlow: async () => flow });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ url: "https://auth.example/go", instructions: "Paste the code" });
  });
  it("complete calls the stored flow.complete and reports the account", async () => {
    const flow = fakeFlow();
    await accountsLoginBegin("stub", { resolveLoginFlow: async () => flow });
    const res = await accountsLoginComplete("stub", "the-code");
    expect(flow.complete).toHaveBeenCalledWith("the-code");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toMatchObject({ added: true, label: "user@example" });
  });
  it("begin errors when the provider has no loginFlow", async () => {
    const res = await accountsLoginBegin("keyonly", { resolveLoginFlow: async () => null });
    expect(res.ok).toBe(false);
  });
  it("complete without a prior begin errors", async () => {
    const res = await accountsLoginComplete("never-began", "x");
    expect(res.ok).toBe(false);
  });
  // A provider that catches the redirect itself returns a live promise here. Sending it to
  // the renderer throws DataCloneError on postMessage, which took the whole sidecar down.
  it("reports loopback as a flag, never as the provider's promise", async () => {
    const flow = fakeFlow({ loopback: new Promise(() => {}) });
    const res = await accountsLoginBegin("stub", { resolveLoginFlow: async () => flow });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.loopback).toBe(true);
      expect(() => structuredClone(res.data)).not.toThrow();
    }
  });

  it("says there is no loopback when the provider offers none", async () => {
    const res = await accountsLoginBegin("stub", { resolveLoginFlow: async () => fakeFlow() });
    if (res.ok) expect(res.data.loopback).toBe(false);
  });

  // The provider saves the account itself when its listener fires, so a later paste must not
  // run the flow a second time.
  it("retires the flow once the provider's own listener completes it", async () => {
    let land: (value: { id: string } | null) => void = () => {};
    const flow = fakeFlow({ loopback: new Promise<{ id: string } | null>((r) => { land = r; }) });
    await accountsLoginBegin("stub", { resolveLoginFlow: async () => flow });
    land({ id: "acc1" });
    await new Promise((r) => setTimeout(r, 0));
    expect((await accountsLoginComplete("stub", "the-code")).ok).toBe(false);
    expect(flow.complete).not.toHaveBeenCalled();
  });

  it("cancel invokes the flow cancel and clears it", async () => {
    const flow = fakeFlow();
    await accountsLoginBegin("stub", { resolveLoginFlow: async () => flow });
    await accountsLoginCancel("stub");
    expect(flow.cancel).toHaveBeenCalled();
    const res = await accountsLoginComplete("stub", "x");
    expect(res.ok).toBe(false);
  });
});
