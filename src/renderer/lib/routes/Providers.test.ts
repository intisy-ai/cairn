// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubIntisy } from "../testing.js";
import { router } from "../router.js";
import Providers from "./Providers.svelte";

describe("Providers screen", () => {
  it("renders a provider row from providersList and toggles exposure", async () => {
    const providersSetExposure = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubIntisy({
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
    stubIntisy({ providersList: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });

  it("offers only the All/Connected/OAuth filter chips", async () => {
    stubIntisy({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "oauth-only", label: "OAuthOnly", hasOAuth: true, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
          { id: "key-connected", label: "KeyConnected", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
          { id: "key-unconnected", label: "KeyUnconnected", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByRole, getByText, queryByRole } = render(Providers);
    await waitFor(() => expect(getByText("OAuthOnly")).toBeTruthy());

    expect(getByRole("button", { name: "All" })).toBeTruthy();
    expect(getByRole("button", { name: "Connected" })).toBeTruthy();
    expect(getByRole("button", { name: "OAuth" })).toBeTruthy();
    expect(queryByRole("button", { name: "API key" })).toBeNull();
    expect(queryByRole("button", { name: "Local" })).toBeNull();
  });

  it("filters to hasOAuth rows when the OAuth chip is active", async () => {
    stubIntisy({
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
    stubIntisy({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "key-connected", label: "KeyConnected", hasOAuth: false, accountCount: 1, active: false, exposure: { cc: false, oc: false } },
          { id: "key-unconnected", label: "KeyUnconnected", hasOAuth: false, accountCount: 0, active: false, exposure: { cc: false, oc: false } },
        ],
      }),
    });

    const { getByRole, getByText, queryByText } = render(Providers);
    await waitFor(() => expect(getByText("KeyConnected")).toBeTruthy());
    expect(getByText("KeyUnconnected")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Connected" }));

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
    stubIntisy({ providersList: async () => ({ ok: true, data: [] }), importApps, importRun });

    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText("Import")).toBeTruthy());

    await fireEvent.click(getByText("Import"));

    await waitFor(() => expect(importRun).toHaveBeenCalledWith("claude"));
    expect(importApps).toHaveBeenCalled();
    await waitFor(() => expect(getByText(/exposed 2 provider\(s\) for Claude Code/i)).toBeTruthy());
  });

  it("Import navigates to Apps & plugins when more than one app is importable", async () => {
    stubIntisy({
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

  it("+ Add provider navigates to Apps & plugins", async () => {
    stubIntisy({ providersList: async () => ({ ok: true, data: [] }) });
    router.set({ screen: "providers" });

    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText("+ Add provider")).toBeTruthy());
    await fireEvent.click(getByText("+ Add provider"));

    expect(get(router).screen).toBe("appsPlugins");
  });
});
