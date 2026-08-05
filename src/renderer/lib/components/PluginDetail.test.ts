// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import PluginDetail from "./PluginDetail.svelte";
import type { UnifiedPlugin, PluginVersion } from "@cairn/shared";

const PLUGIN: UnifiedPlugin = {
  name: "wakatime-sync",
  kind: "plugin",
  description: "Tracks time",
  url: "https://github.com/intisy-ai/wakatime-sync",
  updateAvailable: true,
  homes: { claude: { installed: true }, opencode: { installed: true } },
  topics: [],
  displayName: "wakatime-sync",
  icon: "",
  external: false,
  favorite: false,
};

function version(overrides: Partial<PluginVersion> = {}): PluginVersion {
  return { kind: "git", label: "v1.0.0", updateAvailable: false, autoUpdate: true, ...overrides };
}

function props(homes: { id: string; label: string; hasUpdater?: boolean }[]) {
  return {
    plugin: PLUGIN,
    homes,
    onClose: vi.fn(),
    onInstallAll: vi.fn(),
    onRemoveEverywhere: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateHome: vi.fn(async () => {}),
    onToggleHome: vi.fn(),
  };
}

// The detail view opens on the readme; the per-home list lives behind its own tab.
async function openAvailability(homes: { id: string; label: string; hasUpdater?: boolean }[]): Promise<void> {
  render(PluginDetail, { props: props(homes) });
  await fireEvent.click(await screen.findByRole("button", { name: "Availability" }));
}

// Each home is one row of the availability list; the split button above it can carry an
// "Update" of its own, so every assertion here is scoped to the row it is about.
function row(label: string): HTMLElement {
  const item = screen.getAllByRole("listitem").find((li) => li.textContent?.includes(label));
  if (!item) throw new Error(`no availability row for ${label}`);
  return item;
}

describe("PluginDetail availability", () => {
  it("offers Update in place of Remove for the home that is behind", async () => {
    stubCairn({
      pluginVersions: async () => ({ ok: true, data: { claude: version({ updateAvailable: true }), opencode: version() } }),
    });
    await openAvailability([{ id: "claude", label: "Claude Code", hasUpdater: true }, { id: "opencode", label: "OpenCode", hasUpdater: true }]);

    await waitFor(() => expect(within(row("Claude Code")).getByRole("button", { name: "Update" })).toBeInTheDocument());
    expect(within(row("Claude Code")).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(within(row("OpenCode")).getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("keeps Remove for a home that is up to date", async () => {
    stubCairn({ pluginVersions: async () => ({ ok: true, data: { claude: version(), opencode: version() } }) });
    await openAvailability([{ id: "claude", label: "Claude Code", hasUpdater: true }, { id: "opencode", label: "OpenCode", hasUpdater: true }]);

    await waitFor(() => expect(within(row("Claude Code")).getByRole("button", { name: "Remove" })).toBeInTheDocument());
    expect(within(row("Claude Code")).queryByRole("button", { name: "Update" })).toBeNull();
    expect(within(row("OpenCode")).queryByRole("button", { name: "Update" })).toBeNull();
  });

  it("shows no update or auto-update control for a home with no updater", async () => {
    stubCairn({
      pluginVersions: async () => ({ ok: true, data: { claude: version({ updateAvailable: true }), opencode: version({ updateAvailable: true }) } }),
    });
    await openAvailability([{ id: "claude", label: "Claude Code", hasUpdater: false }, { id: "opencode", label: "OpenCode", hasUpdater: false }]);

    await waitFor(() => expect(within(row("Claude Code")).getByRole("button", { name: "Remove" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Update" })).toBeNull();
    expect(screen.queryByRole("switch", { name: /Auto-update/ })).toBeNull();
  });

  it("offers the auto-update toggle where an updater manages the plugin", async () => {
    stubCairn({ pluginVersions: async () => ({ ok: true, data: { claude: version() } }) });
    await openAvailability([{ id: "claude", label: "Claude Code", hasUpdater: true }]);

    expect(await screen.findByRole("switch", { name: "Auto-update Claude Code" })).toBeInTheDocument();
  });
});

describe("PluginDetail settings loading", () => {
  it("fetches no schema while the Configure tab is closed", async () => {
    const configSchemas = vi.fn(async () => ({ ok: true as const, data: [] }));
    stubCairn({ pluginVersions: async () => ({ ok: true, data: { claude: version() } }), configSchemas });
    render(PluginDetail, { props: props([{ id: "claude", label: "Claude Code", hasUpdater: true }]) });

    await screen.findByRole("button", { name: "Availability" });
    await new Promise((r) => setTimeout(r, 20));
    expect(configSchemas).not.toHaveBeenCalled();
  });

  it("fetches the schema once the Configure tab is opened", async () => {
    const configSchemas = vi.fn(async () => ({ ok: true as const, data: [] }));
    stubCairn({ pluginVersions: async () => ({ ok: true, data: { claude: version() } }), configSchemas });
    render(PluginDetail, { props: props([{ id: "claude", label: "Claude Code", hasUpdater: true }]) });

    await fireEvent.click(await screen.findByRole("button", { name: "Configure" }));
    await waitFor(() => expect(configSchemas).toHaveBeenCalledWith("claude"));
  });
});
