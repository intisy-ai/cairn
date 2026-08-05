// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import type { HomePlugins, PluginConfigSchema } from "@cairn/shared";

vi.mock("../theme.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../theme.js")>();
  return { ...actual, applyThemeSetting: vi.fn() };
});

import { applyThemeSetting } from "../theme.js";
import Settings from "./Settings.svelte";

function cairnHome(): HomePlugins {
  return { home: { id: "cairn", label: "Cairn", dir: "/store", present: true, hasUpdater: true }, rows: [] };
}

describe("Settings screen", () => {
  it("loads and saves the four Cairn settings, asserting exact setConfig triples", async () => {
    const setConfigCalls: unknown[][] = [];
    stubCairn({
      getConfig: async (name: string, key: string) => {
        if (name === "cairn" && key === "theme") return { ok: true, data: "dark" };
        if (name === "cairn" && key === "showDeprecated") return { ok: true, data: false };
        if (name === "cairn" && key === "autoUpdateDefault") return { ok: true, data: false };
        if (name === "cairn" && key === "proxyAutostart") return { ok: true, data: true };
        return { ok: true, data: undefined };
      },
      setConfig: async (...args: unknown[]) => {
        setConfigCalls.push(args);
        return { ok: true, data: undefined };
      },
      pluginsList: async () => ({ ok: true, data: [cairnHome()] }),
    });

    render(Settings);

    const themeSelect = (await screen.findByLabelText("Theme")) as HTMLSelectElement;
    const showDeprecatedSwitch = screen.getByRole("switch", { name: "Show deprecated plugins" });
    const autoUpdateSwitch = screen.getByRole("switch", { name: "Auto-update new installs" });
    const proxyAutostartSwitch = screen.getByRole("switch", { name: "Start the local API on launch" });

    await waitFor(() => {
      expect(themeSelect.value).toBe("dark");
      expect(showDeprecatedSwitch.getAttribute("aria-checked")).toBe("false");
      expect(autoUpdateSwitch.getAttribute("aria-checked")).toBe("false");
      expect(proxyAutostartSwitch.getAttribute("aria-checked")).toBe("true");
    });

    await fireEvent.change(themeSelect, { target: { value: "light" } });
    await fireEvent.click(showDeprecatedSwitch);
    await fireEvent.click(autoUpdateSwitch);
    await fireEvent.click(proxyAutostartSwitch);

    await waitFor(() => expect(setConfigCalls).toContainEqual(["cairn", "theme", "light"]));
    expect(setConfigCalls).toContainEqual(["cairn", "showDeprecated", true]);
    expect(setConfigCalls).toContainEqual(["cairn", "autoUpdateDefault", true]);
    expect(setConfigCalls).toContainEqual(["cairn", "proxyAutostart", false]);
  });

  it("renders the shared settings from the schema, not from a hardcoded key list", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [cairnHome()] }),
      globalSettingsRead: async () => ({
        ok: true,
        data: {
          defaults: { activityMinImpact: "info" },
          current: {},
          fields: [{ key: "activityMinImpact", type: "select", label: "Record activity from", options: [{ value: "info", label: "info" }] }],
        },
      }),
    });

    render(Settings);

    expect(await screen.findByLabelText("Record activity from")).toBeInTheDocument();
  });

  it("applies the theme via applyThemeSetting on load and on change", async () => {
    stubCairn({ pluginsList: async () => ({ ok: true, data: [cairnHome()] }) });
    render(Settings);

    const themeSelect = (await screen.findByLabelText("Theme")) as HTMLSelectElement;
    await waitFor(() => expect(applyThemeSetting).toHaveBeenCalledWith("system"));

    await fireEvent.change(themeSelect, { target: { value: "dark" } });
    await waitFor(() => expect(applyThemeSetting).toHaveBeenCalledWith("dark"));
  });

  it("renders a per-app group's boolean field and writes via configWrite on toggle", async () => {
    const writeCalls: unknown[][] = [];
    const schema: PluginConfigSchema = { plugin: "wakatime-sync", defaults: { enabled: true }, current: {} };
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [cairnHome()] }),
      configSchemas: async (home: string) => ({ ok: true, data: home === "cairn" ? [schema] : [] }),
      configWrite: async (...args: unknown[]) => {
        writeCalls.push(args);
        return { ok: true, data: undefined };
      },
    });

    render(Settings);

    const fieldSwitch = await screen.findByRole("switch", { name: "wakatime-sync enabled" });
    expect(fieldSwitch.getAttribute("aria-checked")).toBe("true");

    await fireEvent.click(fieldSwitch);
    await waitFor(() => expect(writeCalls).toContainEqual(["cairn", "wakatime-sync", "enabled", false]));
  });

  it("shows an inline error when pluginsList fails, without blocking the Cairn settings", async () => {
    stubCairn({ pluginsList: async () => ({ ok: false, error: "list boom" }) });
    render(Settings);
    await waitFor(() => expect(screen.getByText(/list boom/i)).toBeTruthy());
    expect(await screen.findByLabelText("Theme")).toBeInTheDocument();
  });

  it("renders the Sync section, persists a category toggle, and runs sync now", async () => {
    const setCalls: [string, unknown][] = [];
    const syncRun = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      syncStatus: async () => ({
        ok: true,
        data: { enabled: true, categories: { accounts: true, plugins: true, settings: true, pluginConfigs: true }, exclude: [], homes: ["/a", "/b"], pluginConfigs: [] },
      }),
      syncSetConfig: async (key, value) => { setCalls.push([key, value]); return { ok: true, data: undefined }; },
      syncRun,
    });
    render(Settings);

    const accountsSwitch = await screen.findByLabelText("Accounts");
    await fireEvent.click(accountsSwitch);
    await waitFor(() => expect(setCalls.some(([k]) => k === "categories")).toBe(true));

    await fireEvent.click(screen.getByRole("button", { name: /sync now/i }));
    await waitFor(() => expect(syncRun).toHaveBeenCalledOnce());
  });
});
