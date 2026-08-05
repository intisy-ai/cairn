// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import PluginMenu from "./PluginMenu.svelte";
import type { HomePlugins, PluginConfigSchema } from "@cairn/shared";

const MENUS = [{ plugin: "ledger", label: "Ledger", homes: ["claude", "opencode"] }];

function sections(): HomePlugins[] {
  return [
    { home: { id: "claude", label: "Claude Code", dir: "/c", present: true, hasUpdater: true }, rows: [] },
    { home: { id: "opencode", label: "OpenCode", dir: "/o", present: true, hasUpdater: true }, rows: [] },
  ];
}

function schema(overrides: Partial<PluginConfigSchema> = {}): PluginConfigSchema {
  return {
    plugin: "ledger",
    defaults: { retention: 5 },
    current: {},
    fields: [{ key: "retention", type: "number", label: "Retention" }],
    ...overrides,
  };
}

describe("PluginMenu", () => {
  it("titles the screen with the label the plugin declared", async () => {
    stubCairn({
      menusList: async () => ({ ok: true, data: MENUS }),
      pluginsList: async () => ({ ok: true, data: sections() }),
      configSchemas: async () => ({ ok: true, data: [schema()] }),
    });
    render(PluginMenu, { props: { plugin: "ledger" } });

    expect(await screen.findByRole("heading", { name: "Ledger" })).toBeInTheDocument();
  });

  it("renders the plugin's own declared settings for the first home it is in", async () => {
    const asked: string[] = [];
    stubCairn({
      menusList: async () => ({ ok: true, data: MENUS }),
      pluginsList: async () => ({ ok: true, data: sections() }),
      configSchemas: async (homeId: string) => { asked.push(homeId); return { ok: true, data: [schema()] }; },
    });
    render(PluginMenu, { props: { plugin: "ledger" } });

    expect(await screen.findByLabelText("ledger Retention")).toHaveValue(5);
    await waitFor(() => expect(asked).toContain("claude"));
  });

  it("switches home when the plugin contributes in more than one", async () => {
    stubCairn({
      menusList: async () => ({ ok: true, data: MENUS }),
      pluginsList: async () => ({ ok: true, data: sections() }),
      configSchemas: async (homeId: string) => ({
        ok: true,
        data: [schema({ current: { retention: homeId === "claude" ? 1 : 2 } })],
      }),
    });
    render(PluginMenu, { props: { plugin: "ledger" } });

    expect(await screen.findByLabelText("ledger Retention")).toHaveValue(1);
    await fireEvent.click(screen.getByRole("button", { name: "OpenCode" }));
    await waitFor(() => expect(screen.getByLabelText("ledger Retention")).toHaveValue(2));
  });

  it("writes a change to the selected home's config", async () => {
    const configWrite = vi.fn(async () => ({ ok: true as const, data: undefined }));
    stubCairn({
      menusList: async () => ({ ok: true, data: MENUS }),
      pluginsList: async () => ({ ok: true, data: sections() }),
      configSchemas: async () => ({ ok: true, data: [schema()] }),
      configWrite,
    });
    render(PluginMenu, { props: { plugin: "ledger" } });

    const input = await screen.findByLabelText("ledger Retention");
    await fireEvent.change(input, { target: { value: "9" } });
    await waitFor(() => expect(configWrite).toHaveBeenCalledWith("claude", "ledger", "retention", 9));
  });

  it("says so when the plugin is installed nowhere", async () => {
    stubCairn({
      menusList: async () => ({ ok: true, data: [{ plugin: "ledger", label: "Ledger", homes: [] }] }),
      pluginsList: async () => ({ ok: true, data: sections() }),
    });
    render(PluginMenu, { props: { plugin: "ledger" } });

    expect(await screen.findByText(/not installed in any app/)).toBeInTheDocument();
  });

  it("surfaces a failure to read the menus instead of rendering an empty screen", async () => {
    stubCairn({ menusList: async () => ({ ok: false, error: "sidecar down" }) });
    render(PluginMenu, { props: { plugin: "ledger" } });

    expect(await screen.findByText(/sidecar down/)).toBeInTheDocument();
  });
});
