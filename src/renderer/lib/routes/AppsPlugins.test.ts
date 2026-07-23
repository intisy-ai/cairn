// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import AppsPlugins from "./AppsPlugins.svelte";
import type { HomePlugins, PluginRow as PluginRowData, PluginHome } from "@cairn/shared";

function row(name: string): PluginRowData {
  return { name, kind: "git", enabled: true, installedVersion: "1.2.0", updateAvailable: false };
}

function cairnSection(rows: PluginRowData[], overrides: Partial<PluginHome> = {}): HomePlugins {
  return { home: { id: "cairn", label: "Cairn", dir: "/store", present: true, hasUpdater: true, ...overrides }, rows };
}

function claudeSection(rows: PluginRowData[], overrides: Partial<PluginHome> = {}): HomePlugins {
  return { home: { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: true, ...overrides }, rows };
}

function opencodeSection(rows: PluginRowData[], overrides: Partial<PluginHome> = {}): HomePlugins {
  return { home: { id: "opencode", label: "OpenCode", dir: "/o", present: true, hasUpdater: true, ...overrides }, rows };
}

function sectionByHeading(label: string): HTMLElement {
  const id = label === "Cairn" ? "cairn" : label === "Claude Code" ? "claude" : "opencode";
  return screen.getByTestId(`home-${id}`);
}

async function openHome(label: string): Promise<void> {
  await fireEvent.click(await screen.findByRole("button", { name: new RegExp(`open ${label} plugins`, "i") }));
}

describe("AppsPlugins screen", () => {
  it("renders master cards with presence and count, no plugin rows", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({
        ok: true,
        data: [cairnSection([row("claude-code-proxy")]), claudeSection([row("plugin-a")]), opencodeSection([], { present: false })],
      }),
    });
    render(AppsPlugins);
    expect(await screen.findByText("Cairn")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.queryByText("plugin-a")).toBeNull();
  });

  it("shows Install CLI on an absent app card and Init only when updater is missing", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({
        ok: true,
        data: [cairnSection([]), claudeSection([], { hasUpdater: false }), opencodeSection([], { present: false })],
      }),
    });
    render(AppsPlugins);
    await screen.findByText("Cairn");
    expect(within(screen.getByTestId("home-opencode")).getByRole("button", { name: /install cli/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("home-claude")).getByRole("button", { name: /init/i })).toBeInTheDocument();
    expect(within(screen.getByTestId("home-cairn")).queryByRole("button", { name: /init/i })).toBeNull();
  });

  it("does not offer to drill into an absent app card", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), opencodeSection([], { present: false })] }),
    });
    render(AppsPlugins);
    await screen.findByText("Cairn");
    expect(within(screen.getByTestId("home-opencode")).queryByRole("button", { name: /open opencode plugins/i })).toBeNull();
  });

  it("drills into a home and shows Import config + Reinit for an app with updater", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([row("plugin-a")])] }),
      importApps: async () => ({ ok: true, data: [{ app: "claude", label: "Claude Code", hasConfig: true }] }),
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    expect(await screen.findByText("plugin-a")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import config/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reinit/i })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    expect(screen.queryByText("plugin-a")).toBeNull();
  });

  it("never shows Init, Reinit, or Import config for Cairn", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([row("claude-code-proxy")])] }),
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open cairn plugins/i }));
    expect(await screen.findByText("claude-code-proxy")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^init$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reinit/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /import config/i })).toBeNull();
  });

  it("uninstalls with a two-click confirm and never offers it for plugin-updater", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([row("plugin-a"), row("plugin-updater")])] }),
      pluginsUninstall: async (...args: unknown[]) => {
        calls.push(args);
        return { ok: true, data: undefined };
      },
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    const uninstallButtons = await screen.findAllByRole("button", { name: /uninstall/i });
    expect(uninstallButtons).toHaveLength(1);
    await fireEvent.click(uninstallButtons[0]);
    expect(calls).toHaveLength(0);
    await fireEvent.click(screen.getByRole("button", { name: /confirm\?/i }));
    await waitFor(() => expect(calls[0]).toEqual(["claude", "plugin-a"]));
  });

  it("re-arms uninstall confirm on a different row", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([row("plugin-a"), row("plugin-b")])] }),
      pluginsUninstall: async () => ({ ok: true, data: undefined }),
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    const uninstallButtons = await screen.findAllByRole("button", { name: /uninstall/i });
    expect(uninstallButtons).toHaveLength(2);
    await fireEvent.click(uninstallButtons[0]);
    expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole("button", { name: /uninstall/i })[0]);
    expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /uninstall/i })).toHaveLength(1);
  });

  it("shows an inline error when appsDetect fails", async () => {
    stubCairn({ appsDetect: async () => ({ ok: false, error: "detect boom" }) });
    render(AppsPlugins);
    await waitFor(() => expect(screen.getByText(/detect boom/i)).toBeTruthy());
  });

  it("shows an inline error when pluginsList fails", async () => {
    stubCairn({ pluginsList: async () => ({ ok: false, error: "list boom" }) });
    render(AppsPlugins);
    await waitFor(() => expect(screen.getByText(/list boom/i)).toBeTruthy());
  });

  it("shows an Import config control for an importable app and runs the import", async () => {
    const importApps = vi.fn(async () => ({
      ok: true,
      data: [{ app: "claude", label: "Claude Code", hasConfig: true }],
    }) as const);
    const importRun = vi.fn(async () => ({
      ok: true,
      data: { accounts: 1, providers: 3, routingImported: false, notes: ["exposed 3 provider(s) for Claude Code"] },
    }) as const);
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      importApps,
      importRun,
    });
    render(AppsPlugins);
    await openHome("claude code");
    await waitFor(() => expect(screen.getByText("Import config")).toBeTruthy());
    await fireEvent.click(screen.getByText("Import config"));
    await waitFor(() => expect(importRun).toHaveBeenCalledWith("claude"));
    await waitFor(() => expect(screen.getByText(/exposed 3 provider\(s\) for Claude Code/i)).toBeTruthy());
  });

  it("does not show an Import config control when no app is importable", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      importApps: async () => ({ ok: true, data: [{ app: "claude", label: "Claude Code", hasConfig: false }] }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Claude Code" })).toBeTruthy());
    expect(screen.queryByText("Import config")).toBeNull();
  });

  it("filters the available list per home kind and hides installed entries", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([row("claude-code-proxy")]), claudeSection([])] }),
      catalogList: async () => ({
        ok: true,
        data: {
          entries: [
            { name: "claude-code-proxy", url: "u1", kind: "proxy", description: "" },
            { name: "opencode-proxy", url: "u2", kind: "proxy", description: "" },
            { name: "wakatime-sync", url: "u3", kind: "plugin", description: "" },
            { name: "stub-auth", url: "u4", kind: "provider", description: "" },
          ],
          source: "gh",
        },
      }),
    });
    render(AppsPlugins);
    await openHome("cairn");
    expect(screen.getAllByRole("button", { name: /^install$/i })).toHaveLength(2);
    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    await openHome("claude code");
    expect(screen.getAllByRole("button", { name: /^install$/i })).toHaveLength(2);
  });

  it("never offers plugin-updater as an installable entry in any section", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([]), opencodeSection([])] }),
      catalogList: async () => ({
        ok: true,
        data: { entries: [{ name: "plugin-updater", url: "u", kind: "plugin", description: "" }], source: "gh" },
      }),
    });
    render(AppsPlugins);
    await openHome("cairn");
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    await openHome("claude code");
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    await openHome("opencode");
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
  });

  it("gates the marketplace on hasUpdater", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([], { hasUpdater: false })] }),
      catalogList: async () => ({
        ok: true,
        data: { entries: [{ name: "stub-auth", url: "u", kind: "provider", description: "" }], source: "anonymous" },
      }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    expect(screen.getByText(/install plugin-updater to manage plugins here/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^install$/i })).toBeNull();
  });

  it("installs into the section's home and refetches", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([])] }),
      catalogList: async () => ({
        ok: true,
        data: { entries: [{ name: "opencode-proxy", url: "u2", kind: "proxy", description: "" }], source: "gh" },
      }),
      pluginsInstall: async (...args: unknown[]) => {
        calls.push(args);
        return { ok: true, data: undefined };
      },
    });
    render(AppsPlugins);
    await openHome("cairn");
    await fireEvent.click(await screen.findByRole("button", { name: /^install$/i }));
    await waitFor(() => expect(calls[0]).toEqual(["cairn", "opencode-proxy", "u2"]));
  });

  it("shows the update badge and toggles enable on a drilled-in plugin row", async () => {
    const pluginsSetEnabled = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([{ ...row("stub-plugin"), updateAvailable: true }])] }),
      pluginsSetEnabled,
    });
    render(AppsPlugins);
    await openHome("cairn");
    await waitFor(() => expect(screen.getByText("stub-plugin")).toBeTruthy());
    expect(screen.getByText("Update available")).toBeTruthy();

    const pluginSwitch = screen.getByRole("switch", { name: /stub-plugin enabled/i });
    await fireEvent.click(pluginSwitch);
    expect(pluginsSetEnabled).toHaveBeenCalledWith("cairn", "stub-plugin", false);
  });

  it("keeps sectionByHeading pointing at the master card testid", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([])] }),
    });
    render(AppsPlugins);
    await screen.findByText("Cairn");
    expect(sectionByHeading("Claude Code")).toBeInTheDocument();
  });
});
