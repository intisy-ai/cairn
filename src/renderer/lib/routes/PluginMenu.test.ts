// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import PluginMenu from "./PluginMenu.svelte";
import { stubCairn } from "../testing.js";

const SCREEN = {
  plugin: "demo", id: "config", label: "Config", homes: ["claude"], refreshOn: ["config."],
  layout: { kind: "stack", children: [{ kind: "text", source: "line" }, { kind: "actions", ids: ["go"] }] },
};

describe("PluginMenu", () => {
  it("paints the plugin's screen from its own data", async () => {
    stubCairn({
      screensList: async () => ({ ok: true, data: [SCREEN] }),
      screenData: async () => ({ ok: true, data: { sources: { line: "from the plugin" } } }),
    });
    render(PluginMenu, { plugin: "demo", screenId: "config" });
    await waitFor(() => expect(screen.getByText("from the plugin")).toBeInTheDocument());
  });

  it("re-reads after an action that asks for a refresh", async () => {
    const screenData = vi.fn(async () => ({ ok: true, data: { sources: { line: "v1" } } }));
    stubCairn({
      screensList: async () => ({ ok: true, data: [SCREEN] }),
      screenData,
      screenInvoke: async () => ({ ok: true, data: { ok: true, refresh: true } }),
    });
    render(PluginMenu, { plugin: "demo", screenId: "config" });
    await waitFor(() => expect(screen.getByRole("button", { name: "go" })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole("button", { name: "go" }));
    await waitFor(() => expect(screenData).toHaveBeenCalledTimes(2));
  });

  it("shows the plugin's own error rather than a blank screen", async () => {
    stubCairn({
      screensList: async () => ({ ok: true, data: [SCREEN] }),
      screenData: async () => ({ ok: false, error: "not a git repository" }),
    });
    render(PluginMenu, { plugin: "demo", screenId: "config" });
    await waitFor(() => expect(screen.getByText(/not a git repository/)).toBeInTheDocument());
  });

  it("says so when the plugin is installed nowhere", async () => {
    stubCairn({ screensList: async () => ({ ok: true, data: [{ ...SCREEN, homes: [] }] }) });
    render(PluginMenu, { plugin: "demo", screenId: "config" });
    await waitFor(() => expect(screen.getByText(/not installed/)).toBeInTheDocument());
  });
});
