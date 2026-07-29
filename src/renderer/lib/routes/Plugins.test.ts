// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
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
});
