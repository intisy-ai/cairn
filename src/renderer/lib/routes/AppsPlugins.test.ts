// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import AppsPlugins from "./AppsPlugins.svelte";
import type { HomePlugins, PluginRow as PluginRowData } from "@cairn/shared";

function row(name: string): PluginRowData {
  return { name, kind: "git", enabled: true, installedVersion: "1.2.0", updateAvailable: false };
}

function cairnSection(rows: PluginRowData[]): HomePlugins {
  return { home: { id: "cairn", label: "Cairn", dir: "/store", present: true, hasUpdater: true }, rows };
}

function claudeSection(rows: PluginRowData[]): HomePlugins {
  return { home: { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: true }, rows };
}

function sectionByHeading(label: string): HTMLElement {
  const id = label === "Cairn" ? "cairn" : label === "Claude Code" ? "claude" : "opencode";
  return screen.getByTestId(`home-${id}`);
}

describe("AppsPlugins screen", () => {
  it("shows the opencode install affordance, the plugin update badge, and toggles enable", async () => {
    const appsInstallCli = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }) as const);
    const pluginsSetEnabled = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [cairnSection([{ ...row("stub-plugin"), updateAvailable: true }])] }),
      appsInstallCli,
      pluginsSetEnabled,
    });

    const { getByText, getByRole } = render(AppsPlugins);

    await waitFor(() => expect(getByText("OpenCode")).toBeTruthy());
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("Installed")).toBeTruthy();
    expect(getByText("Not installed")).toBeTruthy();

    await fireEvent.click(getByText("Install"));
    expect(appsInstallCli).toHaveBeenCalledWith("opencode");

    await waitFor(() => expect(getByText("stub-plugin")).toBeTruthy());
    expect(getByText("Update available")).toBeTruthy();

    const pluginSwitch = getByRole("switch", { name: /stub-plugin enabled/i });
    await fireEvent.click(pluginSwitch);
    expect(pluginsSetEnabled).toHaveBeenCalledWith("cairn", "stub-plugin", false);
  });

  it("shows an inline error when appsDetect fails", async () => {
    stubCairn({ appsDetect: async () => ({ ok: false, error: "detect boom" }) });
    const { getByText } = render(AppsPlugins);
    await waitFor(() => expect(getByText(/detect boom/i)).toBeTruthy());
  });

  it("shows an inline error when pluginsList fails", async () => {
    stubCairn({ pluginsList: async () => ({ ok: false, error: "list boom" }) });
    const { getByText } = render(AppsPlugins);
    await waitFor(() => expect(getByText(/list boom/i)).toBeTruthy());
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
      pluginsList: async () => ({ ok: true, data: [] }),
      importApps,
      importRun,
    });

    const { getByText } = render(AppsPlugins);

    await waitFor(() => expect(getByText("Import config")).toBeTruthy());
    await fireEvent.click(getByText("Import config"));

    await waitFor(() => expect(importRun).toHaveBeenCalledWith("claude"));
    await waitFor(() => expect(getByText(/exposed 3 provider\(s\) for Claude Code/i)).toBeTruthy());
  });

  it("does not show an Import config control when no app is importable", async () => {
    stubCairn({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: [] }),
      importApps: async () => ({ ok: true, data: [{ app: "claude", label: "Claude Code", hasConfig: false }] }),
    });

    const { getByText, queryByText } = render(AppsPlugins);
    await waitFor(() => expect(getByText("Claude Code")).toBeTruthy());
    expect(queryByText("Import config")).toBeNull();
  });

  it("renders one section per present home with its own rows", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [
        { home: { id: "cairn", label: "Cairn", dir: "/s", present: true, hasUpdater: true }, rows: [row("claude-code-proxy")] },
        { home: { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: true }, rows: [row("plugin-a")] },
        { home: { id: "opencode", label: "OpenCode", dir: "/o", present: false, hasUpdater: false }, rows: [] },
      ] }),
      catalogList: async () => ({ ok: true, data: { entries: [], source: "anonymous" } }),
    });
    render(AppsPlugins);
    expect(await screen.findByText("Cairn")).toBeInTheDocument();
    expect(screen.getByText("claude-code-proxy")).toBeInTheDocument();
    expect(screen.getByText("Claude Code", { selector: ".grouphead .label" })).toBeInTheDocument();
    expect(screen.queryByText("OpenCode", { selector: ".grouphead *" })).toBeNull();
  });

  it("filters the available list per home kind and hides installed entries", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [cairnSection([row("claude-code-proxy")]), claudeSection([])] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "claude-code-proxy", url: "u1", kind: "proxy", description: "" },
        { name: "opencode-proxy", url: "u2", kind: "proxy", description: "" },
        { name: "wakatime-sync", url: "u3", kind: "plugin", description: "" },
        { name: "stub-auth", url: "u4", kind: "provider", description: "" },
      ], source: "gh" } }),
    });
    render(AppsPlugins);
    await screen.findByText("Cairn");
    const cairnAvail = within(sectionByHeading("Cairn")).getAllByRole("button", { name: /install/i });
    expect(cairnAvail).toHaveLength(2);
    const claudeAvail = within(sectionByHeading("Claude Code")).getAllByRole("button", { name: /install/i });
    expect(claudeAvail).toHaveLength(2);
  });

  it("gates the marketplace on hasUpdater", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [cairnSection([]), { home: { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: false }, rows: [] }] }),
      catalogList: async () => ({ ok: true, data: { entries: [{ name: "stub-auth", url: "u", kind: "provider", description: "" }], source: "anonymous" } }),
    });
    render(AppsPlugins);
    await screen.findByText("Claude Code");
    expect(screen.getByText(/install plugin-updater to manage plugins here/i)).toBeInTheDocument();
    expect(within(sectionByHeading("Claude Code")).queryByRole("button", { name: /install/i })).toBeNull();
  });

  it("installs into the section's home and refetches", async () => {
    const calls: unknown[][] = [];
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [cairnSection([])] }),
      catalogList: async () => ({ ok: true, data: { entries: [{ name: "opencode-proxy", url: "u2", kind: "proxy", description: "" }], source: "gh" } }),
      pluginsInstall: async (...args: unknown[]) => { calls.push(args); return { ok: true, data: undefined }; },
    });
    render(AppsPlugins);
    const cairnHome = await screen.findByTestId("home-cairn");
    await fireEvent.click(await within(cairnHome).findByRole("button", { name: /install/i }));
    await waitFor(() => expect(calls[0]).toEqual(["cairn", "opencode-proxy", "u2"]));
  });
});
