// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import PluginDetail from "./PluginDetail.svelte";
import type { UnifiedPlugin } from "@cairn/shared";

const PLUGIN: UnifiedPlugin = {
  name: "wakatime-sync",
  kind: "plugin",
  description: "Tracks time",
  url: "https://github.com/intisy-ai/wakatime-sync",
  updateAvailable: false,
  homes: { claude: { installed: true } },
  topics: [],
  displayName: "wakatime-sync",
  icon: "",
  external: false,
  favorite: false,
};

function baseProps(extra: Partial<Record<string, unknown>> = {}) {
  return {
    plugin: PLUGIN,
    homes: [{ id: "claude", label: "Claude Code", hasUpdater: true }],
    onClose: vi.fn(),
    onInstallAll: vi.fn(),
    onRemoveEverywhere: vi.fn(),
    onUpdate: vi.fn(),
    onUpdateHome: vi.fn(async () => {}),
    onToggleHome: vi.fn(),
    ...extra,
  };
}

// The control only lives on the Availability tab, which the detail view does not open by
// default (it opens on the readme).
async function openAvailability(extra: Partial<Record<string, unknown>> = {}) {
  const utils = render(PluginDetail, { props: baseProps(extra) });
  await fireEvent.click(await utils.findByRole("button", { name: "Availability" }));
  return utils;
}

function stubVersions(onExperimental: boolean, experimentalAvailable: boolean | null) {
  stubCairn({
    pluginVersions: async () => ({
      ok: true,
      data: {
        claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental, experimentalAvailable },
      },
    }),
  });
}

describe("PluginDetail channel control", () => {
  it("offers the control only when a channel branch was confirmed", async () => {
    stubVersions(false, true);
    const { findByRole } = await openAvailability();
    expect(await findByRole("group", { name: /update channel/i })).toBeTruthy();
  });

  // The group carries its own accessible name, distinct from the neighbouring auto-update
  // switch, which is a bare pill distinguished only by its own title.
  it("carries an accessible name distinct from the neighbouring auto-update switch", async () => {
    stubVersions(false, true);
    const { findByRole, findByTitle } = await openAvailability();
    expect(await findByRole("group", { name: /update channel/i })).toBeTruthy();
    expect(await findByTitle("Auto-update on launch")).toBeTruthy();
  });

  it("hides it when detection said no", async () => {
    stubVersions(false, false);
    const { queryByRole } = await openAvailability();
    await waitFor(() => expect(queryByRole("group", { name: /update channel/i })).toBeNull());
  });

  it("hides it while detection is still unknown", async () => {
    stubVersions(false, null);
    const { queryByRole } = await openAvailability();
    await waitFor(() => expect(queryByRole("group", { name: /update channel/i })).toBeNull());
  });

  it("renders Stable pressed for a plugin resolved off the experimental channel", async () => {
    stubVersions(false, true);
    const { findByRole } = await openAvailability();
    const stable = await findByRole("button", { name: /stable channel for claude code/i });
    expect(stable.getAttribute("aria-pressed")).toBe("true");
  });

  // A plugin riding the home's global yes must render Experimental pressed, or the control lies
  // and picking Stable writes a value that looks unchanged.
  it("renders Experimental pressed for a plugin on the channel, whether by inheritance or explicitly", async () => {
    stubVersions(true, true);
    const { findByRole } = await openAvailability();
    const experimental = await findByRole("button", { name: /experimental channel for claude code/i });
    expect(experimental.getAttribute("aria-pressed")).toBe("true");
  });

  it("writes an explicit stable channel when Stable is picked", async () => {
    const onSetChannel = vi.fn(async () => true);
    stubVersions(true, true);
    const { findByRole } = await openAvailability({ onSetChannel });
    await fireEvent.click(await findByRole("button", { name: /stable channel for claude code/i }));
    expect(onSetChannel).toHaveBeenCalledWith("claude", "stable");
  });

  it("writes an explicit experimental channel when Experimental is picked", async () => {
    const onSetChannel = vi.fn(async () => true);
    stubVersions(false, true);
    const { findByRole } = await openAvailability({ onSetChannel });
    await fireEvent.click(await findByRole("button", { name: /experimental channel for claude code/i }));
    expect(onSetChannel).toHaveBeenCalledWith("claude", "experimental");
  });

  it("sends inherit, never a resolved value, when Default is picked", async () => {
    const onSetChannel = vi.fn(async () => true);
    stubVersions(false, true);
    const { findByRole } = await openAvailability({ onSetChannel });
    await fireEvent.click(await findByRole("button", { name: /default channel for claude code/i }));
    expect(onSetChannel).toHaveBeenCalledWith("claude", "inherit");
  });

  it("stays on the picked option once the write reports success", async () => {
    const onSetChannel = vi.fn(async () => true);
    stubVersions(false, true);
    const { findByRole } = await openAvailability({ onSetChannel });
    const experimental = await findByRole("button", { name: /experimental channel for claude code/i });
    await fireEvent.click(experimental);
    await waitFor(() => expect(experimental.getAttribute("aria-pressed")).toBe("true"));
  });

  // This is the case the optimistic switch must undo: without a revert, a failed write left the
  // control showing a channel the disk was never moved to.
  it("reverts to the previous selection when the write fails", async () => {
    const onSetChannel = vi.fn(async () => false);
    stubVersions(false, true);
    const { findByRole } = await openAvailability({ onSetChannel });
    const stable = await findByRole("button", { name: /stable channel for claude code/i });
    const experimental = await findByRole("button", { name: /experimental channel for claude code/i });
    await fireEvent.click(experimental);

    await waitFor(() => expect(onSetChannel).toHaveBeenCalledWith("claude", "experimental"));
    await waitFor(() => expect(stable.getAttribute("aria-pressed")).toBe("true"));
    expect(experimental.getAttribute("aria-pressed")).toBe("false");
  });
});
