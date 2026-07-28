// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubCairn } from "../testing.js";
import { router, consumeParams } from "../router.js";
import Providers from "./Providers.svelte";

describe("Providers screen", () => {
  it("renders a provider row from providersList and toggles exposure", async () => {
    const providersSetExposure = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "stub", label: "Stub", hasOAuth: true, accountCount: 2, active: true, exposure: { cc: true, oc: false } },
        ],
      }),
      providersSetExposure,
    });

    const { getByText, getByRole } = render(Providers);

    await waitFor(() => expect(getByText("Stub")).toBeTruthy());
    expect(getByText(/2 accounts/i)).toBeTruthy();

    const ccPill = getByText("CC");
    const ocPill = getByText("OC");
    expect(ccPill.classList.contains("on")).toBe(true);
    expect(ocPill.classList.contains("na")).toBe(true);

    const enabledSwitch = getByRole("switch", { name: /Stub enabled/i });
    expect(enabledSwitch.getAttribute("aria-checked")).toBe("true");

    await fireEvent.click(ocPill);
    expect(providersSetExposure).toHaveBeenCalledWith("stub", "oc", true);
  });

  it("shows an inline error when providersList fails", async () => {
    stubCairn({ providersList: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });

  it("offers only the All/Connected/OAuth filter chips", async () => {
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "oauth-only", label: "OAuthOnly", hasOAuth: true, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
          { id: "key-connected", label: "KeyConnected", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
          { id: "key-unconnected", label: "KeyUnconnected", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByText, container } = render(Providers);
    await waitFor(() => expect(getByText("OAuthOnly")).toBeTruthy());

    const toolbar = within(container.querySelector(".toolbar")!);
    expect(toolbar.getByRole("button", { name: "All" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "Connected" })).toBeTruthy();
    expect(toolbar.getByRole("button", { name: "OAuth" })).toBeTruthy();
    expect(toolbar.queryByRole("button", { name: "API key" })).toBeNull();
    expect(toolbar.queryByRole("button", { name: "Local" })).toBeNull();
  });

  it("filters to hasOAuth rows when the OAuth chip is active", async () => {
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "oauth-only", label: "OAuthOnly", hasOAuth: true, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
          { id: "key-unconnected", label: "KeyUnconnected", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByRole, getByText, queryByText } = render(Providers);
    await waitFor(() => expect(getByText("OAuthOnly")).toBeTruthy());
    expect(getByText("KeyUnconnected")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "OAuth" }));

    await waitFor(() => expect(queryByText("KeyUnconnected")).toBeNull());
    expect(getByText("OAuthOnly")).toBeTruthy();
  });

  it("filters to accountCount>0 rows when the Connected chip is active", async () => {
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "key-connected", label: "KeyConnected", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
          { id: "key-unconnected", label: "KeyUnconnected", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByText, queryByText, container } = render(Providers);
    await waitFor(() => expect(getByText("KeyConnected")).toBeTruthy());
    expect(getByText("KeyUnconnected")).toBeTruthy();

    const toolbar = within(container.querySelector(".toolbar")!);
    await fireEvent.click(toolbar.getByRole("button", { name: "Connected" }));

    await waitFor(() => expect(queryByText("KeyUnconnected")).toBeNull());
    expect(getByText("KeyConnected")).toBeTruthy();
  });

  it("Import calls importApps then importRun for the single importable app, and shows its notes", async () => {
    const importApps = vi.fn(async () => ({
      ok: true,
      data: [{ app: "claude", label: "Claude Code", hasConfig: true }],
    }) as const);
    const importRun = vi.fn(async () => ({
      ok: true,
      data: { accounts: 1, providers: 2, routingImported: true, notes: ["exposed 2 provider(s) for Claude Code"] },
    }) as const);
    stubCairn({ providersList: async () => ({ ok: true, data: [] }), importApps, importRun });

    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText("Import")).toBeTruthy());

    await fireEvent.click(getByText("Import"));

    await waitFor(() => expect(importRun).toHaveBeenCalledWith("claude"));
    expect(importApps).toHaveBeenCalled();
    await waitFor(() => expect(getByText(/exposed 2 provider\(s\) for Claude Code/i)).toBeTruthy());
  });

  it("Import navigates to Apps & plugins when more than one app is importable", async () => {
    stubCairn({
      providersList: async () => ({ ok: true, data: [] }),
      importApps: async () => ({
        ok: true,
        data: [
          { app: "claude", label: "Claude Code", hasConfig: true },
          { app: "opencode", label: "OpenCode", hasConfig: true },
        ],
      }),
    });
    router.set({ screen: "providers" });

    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText("Import")).toBeTruthy());
    await fireEvent.click(getByText("Import"));

    await waitFor(() => expect(get(router).screen).toBe("appsPlugins"));
  });

  it("+ Add provider navigates to Apps & plugins with deep-link params", async () => {
    stubCairn({ providersList: async () => ({ ok: true, data: [] }) });
    router.set({ screen: "providers" });

    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText("+ Add provider")).toBeTruthy());
    await fireEvent.click(getByText("+ Add provider"));

    expect(get(router).screen).toBe("appsPlugins");
    const params = consumeParams();
    expect(params).toEqual({ home: "cairn", filter: "provider" });
  });

  it("filters rows by id or by label as the debounced search settles", async () => {
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "gamma-id", label: "Alpha Label", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
          { id: "beta-id", label: "Zeta Label", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByPlaceholderText, getByText, queryByText } = render(Providers);
    await waitFor(() => expect(getByText("Alpha Label")).toBeTruthy());

    const input = getByPlaceholderText("Search providers");

    await fireEvent.input(input, { target: { value: "beta-id" } });
    await waitFor(() => expect(queryByText("Alpha Label")).toBeNull(), { timeout: 1000 });
    expect(getByText("Zeta Label")).toBeTruthy();

    await fireEvent.input(input, { target: { value: "Alpha Label" } });
    await waitFor(() => expect(getByText("Alpha Label")).toBeTruthy(), { timeout: 1000 });
    expect(queryByText("Zeta Label")).toBeNull();
  });

  it("virtualizes a group once its row count exceeds the threshold", async () => {
    const data = Array.from({ length: 25 }, (_, i) => ({
      id: `provider-${i}`,
      label: `Provider ${i}`,
      hasOAuth: false,
      accountCount: 1,
      active: true,
      exposure: { cc: false, oc: false },
    }));
    stubCairn({ providersList: async () => ({ ok: true, data }) });

    const { getByText, container } = render(Providers);
    await waitFor(() => expect(getByText("Provider 0")).toBeTruthy());

    const groupButtons = Array.from(container.querySelectorAll("button.hd"));
    const connectedButton = groupButtons.find((b) => b.querySelector(".lbl")?.textContent === "Connected");
    expect(connectedButton?.querySelector(".cnt")?.textContent).toBe("25");

    const renderedRows = container.querySelectorAll(".row").length;
    expect(renderedRows).toBeGreaterThan(0);
    expect(renderedRows).toBeLessThan(25);
  });

  it("collapsing the Available group hides its rows", async () => {
    stubCairn({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "avail", label: "Available Provider", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByText, queryByText, container } = render(Providers);
    await waitFor(() => expect(getByText("Available Provider")).toBeTruthy());

    const groupButtons = Array.from(container.querySelectorAll("button.hd"));
    const availableButton = groupButtons.find((b) => b.querySelector(".lbl")?.textContent === "Available")!;
    await fireEvent.click(availableButton);

    await waitFor(() => expect(queryByText("Available Provider")).toBeNull());
  });
});
