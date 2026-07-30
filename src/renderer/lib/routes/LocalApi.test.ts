// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubCairn } from "../testing.js";
import { toasts, toast } from "../toast.js";
import LocalApi from "./LocalApi.svelte";

describe("LocalApi screen", () => {
  beforeEach(() => {
    get(toasts).slice().forEach((t) => toast.dismiss(t.id));
  });

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

  it("retries proxyStatus when the retry button is clicked", async () => {
    const proxyStatus = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "boom" })
      .mockResolvedValueOnce({ ok: true, data: { running: false, port: 34567 } });
    stubCairn({ proxyStatus });

    const { getByText, getByRole } = render(LocalApi);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());

    const retryButton = getByRole("button", { name: /retry/i });
    await fireEvent.click(retryButton);

    expect(proxyStatus).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());
  });

  it("shows the start error when proxyStart fails", async () => {
    const proxyStart = vi.fn(async () => ({ ok: false, error: "no proxy plugin installed" }) as const);
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      proxyStart,
    });

    const { getByText } = render(LocalApi);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());

    await fireEvent.click(getByText("Start local API"));
    await waitFor(() => {
      expect(getByText(/no proxy plugin installed/i)).toBeTruthy();
      expect(getByText("Start local API")).toBeTruthy();
    });
  });

  it("toasts an error when saving the port fails", async () => {
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      setConfig: async () => ({ ok: false, error: "boom" }),
    });

    const { getByLabelText, getByText } = render(LocalApi);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());

    const input = getByLabelText("Local API port") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "8080" } });
    await fireEvent.click(getByText("Save"));

    await waitFor(() => expect(get(toasts).some((t) => t.kind === "error" && t.message === "boom")).toBe(true));
  });

  it("toasts success when saving the port succeeds", async () => {
    stubCairn({
      proxyStatus: async () => ({ ok: true, data: { running: false, port: 34567 } }),
      setConfig: async () => ({ ok: true, data: undefined }),
    });

    const { getByLabelText, getByText } = render(LocalApi);
    await waitFor(() => expect(getByText("Stopped")).toBeTruthy());

    const input = getByLabelText("Local API port") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "8080" } });
    await fireEvent.click(getByText("Save"));

    await waitFor(() => expect(get(toasts).some((t) => t.kind === "success" && t.message === "Local API port saved")).toBe(true));
  });
});
