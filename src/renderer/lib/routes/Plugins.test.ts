// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubCairn } from "../testing.js";
import { downloads, resetDownloadsForTest } from "../downloads.js";
import { router, navigate } from "../router.js";
import Plugins from "./Plugins.svelte";
import type { HomePlugins, PluginHome } from "@cairn/shared";

function home(id: string, label: string, overrides: Partial<PluginHome> = {}): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true, ...overrides };
}

const CAIRN = home("cairn", "Cairn");
const CLAUDE = home("claude", "Claude Code");
const OPENCODE = home("opencode", "OpenCode");

function baseSections(): HomePlugins[] {
  return [
    { home: CAIRN, rows: [] },
    { home: CLAUDE, rows: [{ name: "wakatime-sync", kind: "git", enabled: true, updateAvailable: false, description: "Tracks time" }] },
    { home: OPENCODE, rows: [] },
  ];
}

function baseCatalog() {
  return {
    entries: [
      { name: "wakatime-sync", url: "uw", kind: "plugin" as const, description: "cat desc", deprecated: false },
      { name: "demo", url: "u", kind: "plugin" as const, description: "Demo from catalog", deprecated: false },
    ],
    source: "gh" as const,
  };
}

describe("Plugins screen", () => {
  beforeEach(() => {
    resetDownloadsForTest();
  });

  it("renders a unified row per plugin with its description text", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);

    expect(await screen.findByText("wakatime-sync")).toBeInTheDocument();
    expect(screen.getByText("Tracks time")).toBeInTheDocument();
    expect(screen.getByText("demo")).toBeInTheDocument();
    expect(screen.getByText("Demo from catalog")).toBeInTheDocument();
  });

  it("clicking the star button favorites a plugin locally and mirrors the star to GitHub, without opening the detail view", async () => {
    const favoritesToggle = vi.fn(async (name: string) => ({ ok: true, data: [name] }) as const);
    const githubSetStar = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      githubStatus: async () => ({ ok: true, data: { source: "config", connected: true, login: "octocat", name: null, avatarUrl: null, ghCliDetected: false, ghCli: null, accounts: [{ login: "octocat", name: null, avatarUrl: null }], activeLogin: "octocat", cairnRepoUrl: "https://github.com/intisy-ai/cairn", cairnStarred: null } }),
      favoritesToggle,
      githubSetStar,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Favorite" }));

    await waitFor(() => expect(favoritesToggle).toHaveBeenCalledWith("demo"));
    await waitFor(() => expect(githubSetStar).toHaveBeenCalledWith("u", true));
    // The row's own open button, not the favorite button, is what opens the detail view.
    expect(screen.queryByText("Every provider, proxy, and plugin")).toBeNull();
  });

  it("prompts to connect GitHub instead of favoriting when starring while not connected", async () => {
    const favoritesToggle = vi.fn(async (name: string) => ({ ok: true, data: [name] }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      favoritesToggle,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Favorite" }));

    await screen.findByRole("dialog", { name: "Add GitHub account" });
    expect(favoritesToggle).not.toHaveBeenCalled();
  });

  it("the Favorites chip filters to favorited plugins and a favorited plugin sorts to the top", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      favoritesList: async () => ({ ok: true, data: ["demo"] }),
    });
    render(Plugins);

    await screen.findByTestId("plugin-demo");
    const rowsBefore = screen.getAllByTestId(/^plugin-/);
    expect(rowsBefore[0]).toHaveAttribute("data-testid", "plugin-demo");

    await fireEvent.click(screen.getByRole("button", { name: /Favorites/ }));
    expect(screen.getByTestId("plugin-demo")).toBeInTheDocument();
    expect(screen.queryByTestId("plugin-wakatime-sync")).not.toBeInTheDocument();
  });

  it("shows claude filled and opencode outline for a plugin installed only on claude", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    const claudePill = row.getByTitle("Claude Code");
    const opencodePill = row.getByTitle("OpenCode");
    expect(claudePill.classList.contains("on")).toBe(true);
    expect(opencodePill.classList.contains("na")).toBe(true);
  });

  it("Install (primary) on an uninstalled catalog plugin installs to each applicable home", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstall,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install everywhere" }));

    // One queued task per home so each home's state refreshes as it completes.
    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("claude", "demo", "u", expect.any(Number)));
    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("opencode", "demo", "u", expect.any(Number)));
    // A non-engine install is handled by plugin-updater, not Cairn directly.
    expect(get(downloads).tasks[0].source).toBe("plugin-updater");
  });

  it("clicking an outline pill on an installed plugin installs to that one home", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstall,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    await fireEvent.click(row.getByTitle("OpenCode"));

    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("opencode", "wakatime-sync", "uw", expect.any(Number)));
  });

  it("surfaces a failing home from a multi-home install as a failed download task", async () => {
    const pluginsInstall = vi.fn(async (home: string) =>
      home === "opencode" ? ({ ok: false, error: "disk full" } as const) : ({ ok: true, data: undefined } as const),
    );
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstall,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install everywhere" }));

    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("opencode", "demo", "u", expect.any(Number)));
    await waitFor(() => {
      const failed = get(downloads).tasks.find((t) => t.status === "failed");
      expect(failed?.error).toBe("disk full");
    });
  });

  it("surfaces a rejected install (res.ok=false) as a failed download task", async () => {
    const pluginsInstall = vi.fn(async () => ({ ok: false, error: "network unreachable" }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstall,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install everywhere" }));

    await waitFor(() => expect(pluginsInstall).toHaveBeenCalled());
    await waitFor(() => {
      const task = get(downloads).tasks[0];
      expect(task.status).toBe("failed");
      expect(task.error).toBe("network unreachable");
    });
  });

  it("adding a plugin-kind repo by URL installs to the applicable host-app homes, not cairn", async () => {
    const pluginsInstallMany = vi.fn(async () => ({ ok: true, data: { outcomes: [] } }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstallMany,
    });
    render(Plugins);

    await fireEvent.click(await screen.findByRole("button", { name: "+ Add from URL" }));
    const dialog = within(screen.getByRole("dialog"));
    await fireEvent.input(dialog.getByPlaceholderText("owner/repo or GitHub URL"), {
      target: { value: "https://github.com/intisy-ai/some-plugin" },
    });
    await fireEvent.click(dialog.getByRole("button", { name: "Install" }));

    await waitFor(() =>
      expect(pluginsInstallMany).toHaveBeenCalledWith("some-plugin", "https://github.com/intisy-ai/some-plugin", ["claude", "opencode"], expect.any(Number)),
    );
  });

  it("opens the Add dialog on mount when deep-linked with an add param", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    router.set({ screen: "plugins", params: { add: "1" } });
    render(Plugins);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("shows the display name as the title and the repo name as a subtitle", async () => {
    stubCairn({
      pluginsList: async () => ({
        ok: true,
        data: [
          { home: CAIRN, rows: [] },
          { home: CLAUDE, rows: [{ name: "wakatime-sync", kind: "git", enabled: true, updateAvailable: false, description: "d", displayName: "WakaTime", icon: "" }] },
          { home: OPENCODE, rows: [] },
        ],
      }),
      catalogList: async () => ({ ok: true, data: { entries: [], source: "gh" } }),
    });
    const { findByText, getByText } = render(Plugins);
    expect(await findByText("WakaTime")).toBeInTheDocument();
    expect(getByText("wakatime-sync")).toBeInTheDocument();
  });

  it("renders repo topic chips on a plugin row", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: { entries: [{ name: "wakatime-sync", url: "u", kind: "plugin", description: "Tracks time", deprecated: false, topics: ["intisy-ai", "plugin", "typescript"] }], source: "gh" } }),
    });
    const { findAllByTestId } = render(Plugins);
    const chips = await findAllByTestId("topic");
    expect(chips.map((c) => c.textContent)).toEqual(expect.arrayContaining(["intisy-ai", "plugin", "typescript"]));
  });

  it("gates install into a home without plugin-updater but lets engines through", async () => {
    stubCairn({
      pluginsList: async () => ({
        ok: true,
        data: [
          { home: CAIRN, rows: [] },
          { home: home("claude", "Claude Code", { hasUpdater: false }), rows: [] },
          { home: home("opencode", "OpenCode", { hasUpdater: true }), rows: [] },
        ],
      }),
      catalogList: async () => ({
        ok: true,
        data: {
          entries: [
            { name: "wakatime-sync", url: "u", kind: "plugin" as const, description: "normal", deprecated: false, topics: [] },
            { name: "plugin-updater", url: "u", kind: "plugin" as const, description: "engine", deprecated: false, topics: [] },
          ],
          source: "gh" as const,
        },
      }),
      enginesList: async () => ({ ok: true, data: [{ id: "plugin-updater", capability: "plugin-management", url: "https://github.com/intisy-ai/plugin-updater", homes: {} }] }),
    });
    render(Plugins);

    // A normal plugin's Claude pill is gated (no plugin-updater there): a non-interactive span with a hint.
    const normal = within(await screen.findByTestId("plugin-wakatime-sync"));
    const gatedPill = normal.getByTitle(/Claude Code . install plugin-updater/i);
    expect(gatedPill.tagName.toLowerCase()).toBe("span");
    // The engine itself is never gated: its Claude pill stays an install button.
    const engine = within(await screen.findByTestId("plugin-plugin-updater"));
    expect(engine.getByLabelText(/Claude Code: click to install/)).toBeInTheDocument();
  });

  it("offers an Engines filter and shows only engine rows when active", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "plugin-updater", url: "u", kind: "plugin", description: "engine", deprecated: false, topics: [] },
        { name: "wakatime-sync", url: "u", kind: "plugin", description: "normal", deprecated: false, topics: [] },
      ], source: "anonymous" } }),
      enginesList: async () => ({ ok: true, data: [
        { id: "plugin-updater", capability: "plugin-management", url: "https://github.com/intisy-ai/plugin-updater", homes: { claude: { installed: true, enabled: true } } },
      ] }),
    });
    const { getByRole, getByText, queryByText, container } = render(Plugins);
    await waitFor(() => expect(getByText("wakatime-sync")).toBeTruthy());
    const filters = within(container.querySelector(".filters")!);
    await fireEvent.click(filters.getByRole("button", { name: /Engines/ }));
    await waitFor(() => expect(queryByText("wakatime-sync")).toBeNull());
    expect(getByText("plugin-updater")).toBeTruthy();
  });


  it("keeps remove controls in the detail pane for a non-mandatory plugin", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    await fireEvent.click(row.getByTitle("View wakatime-sync"));
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "More install options" }));
    expect(dialog.getByRole("button", { name: "Remove everywhere" })).toBeInTheDocument();
    await fireEvent.click(dialog.getByRole("button", { name: "Availability" }));
    expect(dialog.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("names the single remaining home in the install button", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);
    // wakatime-sync is installed in Claude only, so the one remaining home is named.
    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    expect(row.getByRole("button", { name: "Install in OpenCode" })).toBeInTheDocument();
  });

  it("makes the header split-button Remove everywhere when installed in every applicable home", async () => {
    stubCairn({
      pluginsList: async () => ({
        ok: true,
        data: [
          { home: CAIRN, rows: [] },
          { home: CLAUDE, rows: [{ name: "wakatime-sync", kind: "git", enabled: true, updateAvailable: false, description: "" }] },
          { home: OPENCODE, rows: [{ name: "wakatime-sync", kind: "git", enabled: true, updateAvailable: false, description: "" }] },
        ],
      }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    await fireEvent.click(row.getByTitle("View wakatime-sync"));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("button", { name: "Remove everywhere" })).toBeInTheDocument();
  });

  it("updates a home and toggles its auto-update from the detail's Availability tab", async () => {
    const pluginsSetAutoUpdate = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    const pluginsInstall = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginVersions: async () => ({ ok: true, data: { claude: { kind: "git", label: "v1.0.0", updateAvailable: true, autoUpdate: true } } }),
      pluginsSetAutoUpdate,
      pluginsInstall,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    await fireEvent.click(row.getByTitle("View wakatime-sync"));
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Availability" }));

    await fireEvent.click(dialog.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("claude", "wakatime-sync", expect.any(String), expect.any(Number)));

    await fireEvent.click(dialog.getByRole("switch", { name: "Auto-update Claude Code" }));
    await waitFor(() => expect(pluginsSetAutoUpdate).toHaveBeenCalledWith("claude", "wakatime-sync", false));
  });

  it("confirms before removing a plugin everywhere", async () => {
    const pluginsRemoveEverywhere = vi.fn(async () => ({ ok: true, data: { outcomes: [] } }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsRemoveEverywhere,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-wakatime-sync"));
    await fireEvent.click(row.getByRole("button", { name: "More install options" }));
    await fireEvent.click(row.getByRole("button", { name: "Remove everywhere" }));

    expect(pluginsRemoveEverywhere).not.toHaveBeenCalled();
    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove everywhere" }));

    await waitFor(() => expect(pluginsRemoveEverywhere).toHaveBeenCalledWith("wakatime-sync"));
  });

  it("shows a Clear filters empty state when the search matches nothing, and clicking it restores the rows", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
    });
    render(Plugins);

    expect(await screen.findByText("wakatime-sync")).toBeInTheDocument();

    await fireEvent.input(screen.getByPlaceholderText("Search plugins…"), { target: { value: "nonexistent-plugin-xyz" } });

    const clearButton = await screen.findByRole("button", { name: "Clear filters" });
    expect(screen.getByText("No plugins match your filters.")).toBeInTheDocument();
    expect(screen.queryByText("wakatime-sync")).toBeNull();

    await fireEvent.click(clearButton);

    await waitFor(() => expect(screen.getByText("wakatime-sync")).toBeInTheDocument());
    expect(screen.queryByText("No plugins match your filters.")).toBeNull();
  });

  it("renders a view toggle and starts in grid mode when that is the stored preference, showing plugin cards", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      getConfig: async () => ({ ok: true, data: "grid" }),
    });
    render(Plugins);

    expect(await screen.findByRole("button", { name: "Grid view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List view" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("plugins-grid")).toBeInTheDocument());
    const grid = within(screen.getByTestId("plugins-grid"));
    expect(grid.getByText("wakatime-sync")).toBeInTheDocument();
    expect(grid.getByText("Tracks time")).toBeInTheDocument();
  });

  it("switches back to list view and persists the choice", async () => {
    const setConfig = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      getConfig: async () => ({ ok: true, data: "grid" }),
      setConfig,
    });
    render(Plugins);

    await waitFor(() => expect(screen.getByTestId("plugins-grid")).toBeInTheDocument());

    await fireEvent.click(screen.getByRole("button", { name: "List view" }));

    await waitFor(() => expect(document.querySelector(".row")).toBeInTheDocument());
    expect(screen.queryByTestId("plugins-grid")).toBeNull();
    await waitFor(() => expect(setConfig).toHaveBeenCalledWith("cairn", "viewMode.plugins", "list"));
  });

  it("keeps the Engines filter and grid mode working together", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "plugin-updater", url: "u", kind: "plugin", description: "engine", deprecated: false, topics: [] },
        { name: "wakatime-sync", url: "u", kind: "plugin", description: "normal", deprecated: false, topics: [] },
      ], source: "anonymous" } }),
      enginesList: async () => ({ ok: true, data: [
        { id: "plugin-updater", capability: "plugin-management", url: "https://github.com/intisy-ai/plugin-updater", homes: { claude: { installed: true, enabled: true } } },
      ] }),
      getConfig: async () => ({ ok: true, data: "grid" }),
    });
    render(Plugins);

    await waitFor(() => expect(screen.getByTestId("plugins-grid")).toBeInTheDocument());
    expect(await screen.findByTestId("plugin-plugin-updater")).toBeInTheDocument();

    const filters = within(document.querySelector(".filters")!);
    await fireEvent.click(filters.getByRole("button", { name: /Engines/ }));
    await waitFor(() => expect(screen.queryByText("wakatime-sync")).toBeNull());
    expect(screen.getByText("plugin-updater")).toBeInTheDocument();
  });

  it("shows a loading skeleton before plugins resolve, then content", async () => {
    let resolvePlugins!: (v: { ok: true; data: HomePlugins[] }) => void;
    const pending = new Promise<{ ok: true; data: HomePlugins[] }>((r) => (resolvePlugins = r));
    stubCairn({
      pluginsList: () => pending,
      catalogList: async () => ({ ok: true, data: { entries: [], source: "anonymous" } }),
    });
    const { getAllByTestId, queryAllByTestId } = render(Plugins);

    expect(getAllByTestId("skeleton").length).toBeGreaterThan(0);
    resolvePlugins({ ok: true, data: baseSections() });
    await waitFor(() => expect(queryAllByTestId("skeleton").length).toBe(0));
  });

  it("opens on the plugin filter by default, hiding non-plugin repos", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "acme-provider", url: "u", kind: "provider" as const, description: "a provider", deprecated: false, topics: [] },
        { name: "demo", url: "u", kind: "plugin" as const, description: "a plugin", deprecated: false, topics: [] },
      ], source: "gh" as const } }),
    });
    render(Plugins);
    expect(await screen.findByText("demo")).toBeInTheDocument();
    expect(screen.queryByText("acme-provider")).toBeNull();
  });

  it("preselects the provider filter when opened via an Add-provider deep link", async () => {
    navigate("plugins", { kind: "provider" });
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "acme-provider", url: "u", kind: "provider" as const, description: "a provider", deprecated: false, topics: [] },
        { name: "demo", url: "u", kind: "plugin" as const, description: "a plugin", deprecated: false, topics: [] },
      ], source: "gh" as const } }),
    });
    render(Plugins);
    expect(await screen.findByText("acme-provider")).toBeInTheDocument();
    expect(screen.queryByText("demo")).toBeNull();
  });

  it("shows loaders under the Loaders filter, hidden by default", async () => {
    stubCairn({
      pluginsList: async () => ({ ok: true, data: [] }),
      catalogList: async () => ({ ok: true, data: { entries: [
        { name: "opencode-loader", url: "u", kind: "loader" as const, description: "a loader", deprecated: false, topics: [] },
        { name: "demo", url: "u", kind: "plugin" as const, description: "a plugin", deprecated: false, topics: [] },
      ], source: "gh" as const } }),
    });
    const { getByText, queryByText, container } = render(Plugins);
    await waitFor(() => expect(getByText("demo")).toBeTruthy());
    expect(queryByText("opencode-loader")).toBeNull();
    const filters = within(container.querySelector(".filters")!);
    await fireEvent.click(filters.getByRole("button", { name: /Loaders/ }));
    await waitFor(() => expect(getByText("opencode-loader")).toBeTruthy());
    expect(queryByText("demo")).toBeNull();
  });
});
