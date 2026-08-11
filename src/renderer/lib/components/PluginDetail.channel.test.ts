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

// The switch only lives on the Availability tab, which the detail view does not open by
// default (it opens on the readme).
async function openAvailability(extra: Partial<Record<string, unknown>> = {}) {
  const utils = render(PluginDetail, { props: baseProps(extra) });
  await fireEvent.click(await utils.findByRole("button", { name: "Availability" }));
  return utils;
}

describe("PluginDetail channel control", () => {
  it("offers the switch only when a channel branch was confirmed", async () => {
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: false, experimentalAvailable: true },
        },
      }),
    });

    const { findByLabelText } = await openAvailability();
    expect(await findByLabelText(/experimental/i)).toBeTruthy();
  });

  it("hides it when detection said no", async () => {
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: false, experimentalAvailable: false },
        },
      }),
    });

    const { queryByLabelText } = await openAvailability();
    await waitFor(() => expect(queryByLabelText(/experimental/i)).toBeNull());
  });

  it("hides it while detection is still unknown", async () => {
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: false, experimentalAvailable: null },
        },
      }),
    });

    const { queryByLabelText } = await openAvailability();
    await waitFor(() => expect(queryByLabelText(/experimental/i)).toBeNull());
  });

  // A plugin riding the home's global yes must render checked, or the control lies and
  // switching it off writes a value that changes nothing.
  it("renders checked for a plugin on the channel by inheritance", async () => {
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: true, experimentalAvailable: true },
        },
      }),
    });

    const { findByLabelText } = await openAvailability();
    const control = await findByLabelText(/experimental/i);
    expect(control.getAttribute("aria-checked")).toBe("true");
  });

  it("writes an explicit stable channel when switched off, never inherit", async () => {
    const onSetChannel = vi.fn();
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: true, experimentalAvailable: true },
        },
      }),
    });

    const { findByLabelText } = await openAvailability({ onSetChannel });
    await fireEvent.click(await findByLabelText(/experimental/i));

    expect(onSetChannel).toHaveBeenCalledWith("claude", "stable");
  });

  it("writes an explicit experimental channel when switched on", async () => {
    const onSetChannel = vi.fn();
    stubCairn({
      pluginVersions: async () => ({
        ok: true,
        data: {
          claude: { kind: "git", label: "v1", updateState: "current", autoUpdate: true, onExperimental: false, experimentalAvailable: true },
        },
      }),
    });

    const { findByLabelText } = await openAvailability({ onSetChannel });
    await fireEvent.click(await findByLabelText(/experimental/i));

    expect(onSetChannel).toHaveBeenCalledWith("claude", "experimental");
  });
});
