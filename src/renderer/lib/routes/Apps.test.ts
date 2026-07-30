// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Apps from "./Apps.svelte";

const TWO_APPS = {
  appsList: async () =>
    ({
      ok: true,
      data: [
        { id: "claude", label: "Claude Code" },
        { id: "opencode", label: "OpenCode" },
      ],
    }) as const,
};

describe("Apps screen", () => {
  it("renders one row per host app and no cairn row", async () => {
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
    });
    render(Apps);
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.queryByText("Cairn")).toBeNull();
  });

  it("opens a detail with the summary when a detected app row is clicked", async () => {
    const appsSummary = vi.fn(async () => ({
      ok: true,
      data: {
        accounts: [],
        providerCount: 2,
        accountsEnabled: 1,
        providerBreakdown: [],
        quotaMinPct: null,
        configDir: "/home/jane/.claude",
        pluginCount: 3,
        routingSlots: null,
      },
    }) as const);
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      appsSummary,
    });
    render(Apps);

    // No summary is fetched until the row is opened.
    const claudeRow = within(await screen.findByTestId("app-claude"));
    expect(appsSummary).not.toHaveBeenCalled();

    await fireEvent.click(claudeRow.getByText("Claude Code"));

    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(dialog.getByTestId("stat-providers")).toHaveTextContent(/2\s*providers/i));
    expect(dialog.getByTestId("stat-enabled")).toHaveTextContent(/1\s*enabled/i);
    expect(dialog.getByTestId("stat-plugins")).toHaveTextContent(/3\s*plugins/i);
    expect(appsSummary).toHaveBeenCalledWith("claude");
  });

  it("shows an inline Install CLI action for an absent app and calls appsInstallCli", async () => {
    const appsInstallCli = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }) as const);
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      appsInstallCli,
    });
    render(Apps);

    const opencodeRow = within(await screen.findByTestId("app-opencode"));
    await fireEvent.click(opencodeRow.getByRole("button", { name: /install cli/i }));

    await waitFor(() => expect(appsInstallCli).toHaveBeenCalledWith("opencode"));
  });

  it("offers Import config in the detail of an app with importable config and opens the dialog", async () => {
    const importPreview = vi.fn(async () => ({
      ok: true,
      data: { accounts: 2, routingSlots: 1, exposedProviders: 3 },
    }) as const);
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: true } }),
      appsSummary: async () => ({
        ok: true,
        data: {
          accounts: [],
          providerCount: 0,
          accountsEnabled: 0,
          providerBreakdown: [],
          quotaMinPct: null,
          configDir: "/home/jane/.claude",
          pluginCount: 0,
          routingSlots: null,
        },
      }),
      importApps: async () => ({
        ok: true,
        data: [
          { app: "claude", label: "Claude Code", hasConfig: true },
          { app: "opencode", label: "OpenCode", hasConfig: false },
        ],
      }),
      importPreview,
    });
    render(Apps);

    const claudeRow = within(await screen.findByTestId("app-claude"));
    await fireEvent.click(claudeRow.getByText("Claude Code"));

    const dialog = within(await screen.findByRole("dialog"));
    const importButton = await dialog.findByRole("button", { name: /import config/i });
    await fireEvent.click(importButton);
    await waitFor(() => expect(importPreview).toHaveBeenCalledWith("claude"));
  });

  it("does not offer Import config for an app without importable config", async () => {
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: false, opencode: true } }),
      appsSummary: async () => ({
        ok: true,
        data: {
          accounts: [],
          providerCount: 0,
          accountsEnabled: 0,
          providerBreakdown: [],
          quotaMinPct: null,
          configDir: "/home/jane/.config/opencode",
          pluginCount: 0,
          routingSlots: null,
        },
      }),
      importApps: async () => ({
        ok: true,
        data: [{ app: "opencode", label: "OpenCode", hasConfig: false }],
      }),
    });
    render(Apps);

    const opencodeRow = within(await screen.findByTestId("app-opencode"));
    await fireEvent.click(opencodeRow.getByText("OpenCode"));

    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(dialog.getByTestId("stat-providers")).toBeInTheDocument());
    expect(dialog.queryByRole("button", { name: /import config/i })).toBeNull();
  });

  it("renders a view toggle and starts in grid mode when that is the stored preference", async () => {
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      getConfig: async () => ({ ok: true, data: "grid" }),
    });
    render(Apps);

    expect(await screen.findByRole("button", { name: "Grid view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "List view" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("apps-grid")).toBeInTheDocument());
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
  });

  it("switches back to list view and persists the choice", async () => {
    const setConfig = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({
      ...TWO_APPS,
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      getConfig: async () => ({ ok: true, data: "grid" }),
      setConfig,
    });
    render(Apps);

    await waitFor(() => expect(screen.getByTestId("apps-grid")).toBeInTheDocument());

    await fireEvent.click(screen.getByRole("button", { name: "List view" }));

    await waitFor(() => expect(document.querySelector("ul.list")).toBeInTheDocument());
    expect(screen.queryByTestId("apps-grid")).toBeNull();
    await waitFor(() => expect(setConfig).toHaveBeenCalledWith("cairn", "viewMode.apps", "list"));
  });
});
