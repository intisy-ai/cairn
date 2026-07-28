// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import { router } from "../router.js";
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

  it("shows Install CLI on an absent app card", async () => {
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
    expect(within(screen.getByTestId("home-cairn")).queryByRole("button", { name: /init/i })).toBeNull();
    expect(within(screen.getByTestId("home-claude")).queryByRole("button", { name: /init/i })).toBeNull();
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

  it("drills into a home and shows Import config for an app with updater", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([row("plugin-a")])] }),
      importApps: async () => ({ ok: true, data: [{ app: "claude", label: "Claude Code", hasConfig: true }] }),
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    expect(await screen.findByText("plugin-a")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import config/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reinit/i })).toBeNull();
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
    const uninstallButtons = await screen.findAllByRole("button", { name: "Uninstall" });
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
    const uninstallButtons = await screen.findAllByRole("button", { name: "Uninstall" });
    expect(uninstallButtons).toHaveLength(2);
    await fireEvent.click(uninstallButtons[0]);
    expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
    await fireEvent.click(screen.getAllByRole("button", { name: "Uninstall" })[0]);
    expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Uninstall" })).toHaveLength(1);
  });

  it("clears uninstall confirm when navigating away and back", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({
        ok: true,
        data: [cairnSection([]), claudeSection([row("plugin-a")])],
      }),
      pluginsUninstall: async (...args: unknown[]) => {
        calls.push(args);
        return { ok: true, data: undefined };
      },
    });
    render(AppsPlugins);
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    const uninstallButton = await screen.findByRole("button", { name: "Uninstall" });
    await fireEvent.click(uninstallButton);
    expect(screen.getByRole("button", { name: /confirm\?/i })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    expect(screen.queryByRole("button", { name: /confirm\?/i })).toBeNull();
    await fireEvent.click(await screen.findByRole("button", { name: /open claude code plugins/i }));
    expect(screen.getByRole("button", { name: "Uninstall" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm\?/i })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    expect(calls).toHaveLength(0);
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
            { name: "claude-code-proxy", url: "u1", kind: "proxy", description: "", deprecated: false },
            { name: "opencode-proxy", url: "u2", kind: "proxy", description: "", deprecated: false },
            { name: "wakatime-sync", url: "u3", kind: "plugin", description: "", deprecated: false },
            { name: "stub-auth", url: "u4", kind: "provider", description: "", deprecated: false },
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
        data: { entries: [{ name: "plugin-updater", url: "u", kind: "plugin", description: "", deprecated: false }], source: "gh" },
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
        data: { entries: [{ name: "stub-auth", url: "u", kind: "provider", description: "", deprecated: false }], source: "anonymous" },
      }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    expect(screen.getByText(/install plugin-updater to manage plugins here/i)).toBeInTheDocument();
    // The only remaining Install button belongs to the pinned machinery row.
    expect(screen.getAllByRole("button", { name: /^install$/i })).toHaveLength(1);
    expect(within(screen.getByTestId("machinery-row")).getByRole("button", { name: /^install$/i })).toBeInTheDocument();
  });

  it("installs into the section's home and refetches", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([])] }),
      catalogList: async () => ({
        ok: true,
        data: { entries: [{ name: "opencode-proxy", url: "u2", kind: "proxy", description: "", deprecated: false }], source: "gh" },
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

  it("pins the machinery row and installs the updater from it", async () => {
    const appsInit = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }) as const);
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), claudeSection([row("plugin-a")], { hasUpdater: false })] }),
      appsInit,
    });
    const { container } = render(AppsPlugins);
    await openHome("claude code");
    const machineryRow = screen.getByTestId("machinery-row");
    expect(within(machineryRow).getByText("plugin-updater")).toBeInTheDocument();
    expect(within(machineryRow).getByText("Not installed")).toBeInTheDocument();
    expect(container.textContent!.indexOf("plugin-updater")).toBeLessThan(container.textContent!.indexOf("plugin-a"));

    await fireEvent.click(within(machineryRow).getByRole("button", { name: /^install$/i }));
    await waitFor(() => expect(appsInit).toHaveBeenCalledWith("claude"));
  });

  it("shows Installed with no toggle or uninstall on the machinery row when the updater is present", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([row("plugin-a")])] }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    const machineryRow = screen.getByTestId("machinery-row");
    expect(within(machineryRow).getByText("Installed")).toBeInTheDocument();
    expect(within(machineryRow).queryByRole("switch")).toBeNull();
    expect(within(machineryRow).queryByRole("button")).toBeNull();
  });

  it("filters installed rows and marketplace by chip and search", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([row("stub-auth"), row("wakatime-sync")])] }),
      catalogList: async () => ({
        ok: true,
        data: {
          entries: [
            { name: "stub-auth", url: "u1", kind: "provider", description: "", deprecated: false },
            { name: "wakatime-sync", url: "u2", kind: "plugin", description: "", deprecated: false },
            { name: "claude-code-proxy", url: "u3", kind: "proxy", description: "", deprecated: false },
            { name: "antigravity-auth", url: "u4", kind: "provider", description: "", deprecated: false },
          ],
          source: "gh",
        },
      }),
    });
    render(AppsPlugins);
    await openHome("cairn");
    expect(screen.getByText("stub-auth")).toBeInTheDocument();
    expect(screen.getByText("wakatime-sync")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^install$/i })).toHaveLength(2);

    await fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    expect(screen.getByText("stub-auth")).toBeInTheDocument();
    expect(screen.queryByText("wakatime-sync")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^install$/i })).toHaveLength(1);
    expect(screen.getByText("antigravity-auth")).toBeInTheDocument();
    expect(screen.queryByText("claude-code-proxy")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "All" }));
    await fireEvent.input(screen.getByPlaceholderText("Search plugins…"), { target: { value: "stub" } });
    expect(screen.getByText("stub-auth")).toBeInTheDocument();
    expect(screen.queryByText("wakatime-sync")).toBeNull();
    expect(screen.queryByText("antigravity-auth")).toBeNull();
    expect(screen.queryByText("claude-code-proxy")).toBeNull();
  });

  it("consumes deep-link params to open cairn with the provider filter", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([row("stub-auth"), row("wakatime-sync")])] }),
      catalogList: async () => ({
        ok: true,
        data: {
          entries: [
            { name: "stub-auth", url: "u0", kind: "provider", description: "", deprecated: false },
            { name: "wakatime-sync", url: "u1", kind: "plugin", description: "", deprecated: false },
            { name: "antigravity-auth", url: "u2", kind: "provider", description: "", deprecated: false },
          ],
          source: "gh",
        },
      }),
    });
    router.set({ screen: "appsPlugins", params: { home: "cairn", filter: "provider" } });
    render(AppsPlugins);
    expect(await screen.findByRole("heading", { name: "Cairn" })).toBeInTheDocument();
    expect(screen.getByText("stub-auth")).toBeInTheDocument();
    expect(screen.queryByText("wakatime-sync")).toBeNull();
    expect(screen.getByText("antigravity-auth")).toBeInTheDocument();
  });

  it("tucks deprecated entries into a bottom group and warns on installed ones", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([row("old-plugin")])] }),
      catalogList: async () => ({
        ok: true,
        data: {
          entries: [
            { name: "old-plugin", url: "u1", kind: "plugin", description: "", deprecated: true },
            { name: "shiny-new-plugin", url: "u2", kind: "plugin", description: "", deprecated: false },
            { name: "legacy-tool", url: "u3", kind: "plugin", description: "", deprecated: true },
          ],
          source: "gh",
        },
      }),
    });
    render(AppsPlugins);
    await openHome("claude code");

    expect(screen.getByText("shiny-new-plugin")).toBeInTheDocument();
    expect(within(screen.getByTestId("marketplace-main")).queryByText("legacy-tool")).toBeNull();

    const group = screen.getByTestId("deprecated-group");
    expect(within(group).getByText("legacy-tool")).toBeInTheDocument();
    expect(within(group).getByText("Deprecated")).toBeInTheDocument();

    const installedRow = screen.getByText("old-plugin").closest(".row") as HTMLElement;
    expect(within(installedRow).getByText("Deprecated")).toBeInTheDocument();
  });

  it("hides deprecated entries entirely when showDeprecated is off", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      catalogList: async () => ({
        ok: true,
        data: { entries: [{ name: "legacy-tool", url: "u3", kind: "plugin", description: "", deprecated: true }], source: "gh" },
      }),
      getConfig: async (name: string, key: string) =>
        name === "cairn" && key === "showDeprecated" ? { ok: true, data: false } : { ok: true, data: undefined },
    });
    render(AppsPlugins);
    await openHome("claude code");
    await waitFor(() => expect(screen.queryByTestId("deprecated-group")).toBeNull());
    expect(screen.queryByText("legacy-tool")).toBeNull();
  });

  it("renders the app summary read-only", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      appsSummary: async () => ({
        ok: true,
        data: {
          accounts: [{ provider: "anthropic", label: "jane@example.com", enabled: true, quotaPct: 82 }],
          configDir: "/home/jane/.claude",
          pluginCount: 3,
          routingSlots: 2,
        },
      }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    expect(await screen.findByText(/jane@example.com/)).toBeInTheDocument();
    expect(screen.getByText("/home/jane/.claude")).toBeInTheDocument();
    expect(screen.getByText(/3 plugins/i)).toBeInTheDocument();
    expect(screen.getByText(/2 routing slots/i)).toBeInTheDocument();
  });

  it("renders a muted line when the app summary fails to load, without blocking the plugin list", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([row("plugin-a")])] }),
      appsSummary: async () => ({ ok: false, error: "summary boom" }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    expect(await screen.findByText(/could not load app summary: summary boom/i)).toBeInTheDocument();
    expect(screen.getByText("plugin-a")).toBeInTheDocument();
  });

  it("app uninstall requires the confirm panel and honors the wipe checkbox", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      appsUninstallCli: async (...args: unknown[]) => {
        calls.push(args);
        return { ok: true, data: { stdout: "", stderr: "" } };
      },
    });
    render(AppsPlugins);
    await openHome("claude code");
    expect(screen.queryByLabelText("Also delete all data")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Uninstall app" }));
    expect(screen.getByLabelText("Also delete all data")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    await waitFor(() => expect(calls[0]).toEqual(["claude", false]));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Claude Code" })).toBeNull());

    await openHome("claude code");
    await fireEvent.click(screen.getByRole("button", { name: "Uninstall app" }));
    await fireEvent.click(screen.getByLabelText("Also delete all data"));
    await fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    await waitFor(() => expect(calls[1]).toEqual(["claude", true]));
  });

  it("resets the uninstall panel when navigating away and back", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
    });
    render(AppsPlugins);
    await openHome("claude code");
    await fireEvent.click(screen.getByRole("button", { name: "Uninstall app" }));
    expect(screen.getByLabelText("Also delete all data")).toBeInTheDocument();

    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    await openHome("claude code");
    expect(screen.queryByLabelText("Also delete all data")).toBeNull();
  });

  it("fresh app-uninstall confirms never inherit the wipe flag when cancelled", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [claudeSection([])] }),
      appsUninstallCli: async (...args: unknown[]) => {
        calls.push(args);
        return { ok: true, data: { stdout: "", stderr: "" } };
      },
    });
    render(AppsPlugins);
    await openHome("claude code");

    await fireEvent.click(screen.getByRole("button", { name: "Uninstall app" }));
    const wipeCheckbox = screen.getByLabelText("Also delete all data") as HTMLInputElement;
    expect(wipeCheckbox.checked).toBe(false);

    await fireEvent.click(wipeCheckbox);
    expect(wipeCheckbox.checked).toBe(true);

    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Also delete all data")).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: "Uninstall app" }));
    const wipeCheckboxAfterReopen = screen.getByLabelText("Also delete all data") as HTMLInputElement;
    expect(wipeCheckboxAfterReopen.checked).toBe(false);

    await fireEvent.click(screen.getByRole("button", { name: "Uninstall" }));
    await waitFor(() => expect(calls[0]).toEqual(["claude", false]));
  });

  it("shows no Init or Reinit buttons anywhere", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({
        ok: true,
        data: [cairnSection([]), claudeSection([], { hasUpdater: false }), opencodeSection([], { present: false })],
      }),
    });
    render(AppsPlugins);
    await screen.findByText("Cairn");
    expect(screen.queryByRole("button", { name: /^init$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reinit/i })).toBeNull();

    await openHome("claude code");
    expect(screen.getByText("Not installed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^init$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reinit/i })).toBeNull();

    await fireEvent.click(screen.getByRole("button", { name: /back to apps/i }));
    await openHome("cairn");
    expect(screen.queryByRole("button", { name: /^init$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reinit/i })).toBeNull();
  });
});
