// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubCairn } from "../testing.js";
import { downloads } from "../downloads.js";
import { router } from "../router.js";
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
    downloads.set({ tasks: [], open: false });
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

  it("Install (primary) on an uninstalled catalog plugin installs to all applicable homes", async () => {
    const pluginsInstallMany = vi.fn(async () => ({ ok: true, data: { outcomes: [] } }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstallMany,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install" }));

    await waitFor(() => expect(pluginsInstallMany).toHaveBeenCalledWith("demo", "u", ["claude", "opencode"]));
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

    await waitFor(() => expect(pluginsInstall).toHaveBeenCalledWith("opencode", "wakatime-sync", "uw"));
  });

  it("surfaces a failed outcome from a multi-home install in the download manager", async () => {
    const pluginsInstallMany = vi.fn(async () => ({
      ok: true,
      data: { outcomes: [{ home: "claude", ok: true }, { home: "opencode", ok: false, error: "disk full" }] },
    }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstallMany,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install" }));

    await waitFor(() => expect(pluginsInstallMany).toHaveBeenCalled());
    await waitFor(() => {
      const task = get(downloads).tasks[0];
      expect(task.status).toBe("failed");
      expect(task.error).toMatch(/opencode: disk full/);
    });
  });

  it("surfaces a rejected multi-home install (res.ok=false) in the download manager", async () => {
    const pluginsInstallMany = vi.fn(async () => ({ ok: false, error: "network unreachable" }) as const);
    stubCairn({
      pluginsList: async () => ({ ok: true, data: baseSections() }),
      catalogList: async () => ({ ok: true, data: baseCatalog() }),
      pluginsInstallMany,
    });
    render(Plugins);

    const row = within(await screen.findByTestId("plugin-demo"));
    await fireEvent.click(row.getByRole("button", { name: "Install" }));

    await waitFor(() => expect(pluginsInstallMany).toHaveBeenCalled());
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
      expect(pluginsInstallMany).toHaveBeenCalledWith("some-plugin", "https://github.com/intisy-ai/some-plugin", ["claude", "opencode"]),
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
});
