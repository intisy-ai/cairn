// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import LocalApi from "./LocalApi.svelte";

describe("LocalApi screen", () => {
  it("shows a start affordance when stopped and calls proxyStart on click", async () => {
    const proxyStart = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      proxyStart,
    });

    const { getByText } = render(LocalApi);

    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());
    expect(getByText("34567")).toBeTruthy();

    await fireEvent.click(getByText("Start local API"));
    await waitFor(() => expect(proxyStart).toHaveBeenCalled());
  });

  it("shows the running state and calls proxyStop on click", async () => {
    const proxyStop = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: true, port: 34567 } }),
      proxyStop,
    });

    const { getByText, getAllByText } = render(LocalApi);

    await waitFor(() => expect(getByText("Running")).toBeTruthy());
    expect(getAllByText("http://127.0.0.1:34567").length).toBeGreaterThan(0);

    await fireEvent.click(getByText("Stop"));
    await waitFor(() => expect(proxyStop).toHaveBeenCalled());
  });

  it("disables the control while a start call is in flight", async () => {
    let resolveStart: (() => void) | undefined;
    const proxyStart = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveStart = () => resolve({ ok: true, data: undefined });
        }),
    );
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      proxyStart: proxyStart as unknown as () => Promise<{ ok: true; data: undefined }>,
    });

    const { getByText } = render(LocalApi);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());

    const button = getByText("Start local API") as HTMLButtonElement;
    await fireEvent.click(button);
    expect(button.disabled).toBe(true);

    resolveStart?.();
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("shows an inline error when proxyStatus fails", async () => {
    stubCairn({ proxyStatus: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(LocalApi);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });

  it("shows the start error when proxyStart fails", async () => {
    const proxyStart = vi.fn(async () => ({ ok: false, error: "claude proxy plugin not installed" }) as const);
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      proxyStart,
    });

    const { getByText } = render(LocalApi);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());

    await fireEvent.click(getByText("Start local API"));
    await waitFor(() => {
      expect(getByText(/claude proxy plugin not installed/i)).toBeTruthy();
      expect(getByText("Start local API")).toBeTruthy();
    });
  });
});
