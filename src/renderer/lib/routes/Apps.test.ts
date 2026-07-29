// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Apps from "./Apps.svelte";

describe("Apps screen", () => {
  it("renders one card per host app and no cairn card", async () => {
    stubCairn({
      appsList: async () => ({
        ok: true,
        data: [
          { id: "claude", label: "Claude Code" },
          { id: "opencode", label: "OpenCode" },
        ],
      }),
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
    });
    render(Apps);
    expect(await screen.findByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("OpenCode")).toBeInTheDocument();
    expect(screen.queryByText("Cairn")).toBeNull();
  });

  it("shows the summary for a detected app and an Install CLI action for an absent one", async () => {
    stubCairn({
      appsList: async () => ({
        ok: true,
        data: [
          { id: "claude", label: "Claude Code" },
          { id: "opencode", label: "OpenCode" },
        ],
      }),
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      appsSummary: async () => ({
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
      }),
    });
    render(Apps);

    const claudeCard = within(await screen.findByTestId("app-claude"));
    await waitFor(() => expect(claudeCard.getByText(/2 providers/i)).toBeInTheDocument());
    expect(claudeCard.getByText(/1 enabled/i)).toBeInTheDocument();
    expect(claudeCard.getByText(/3 plugins/i)).toBeInTheDocument();

    const opencodeCard = within(screen.getByTestId("app-opencode"));
    expect(opencodeCard.getByRole("button", { name: /install cli/i })).toBeInTheDocument();
  });

  it("clicking Install CLI on the absent app calls appsInstallCli", async () => {
    const appsInstallCli = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }) as const);
    stubCairn({
      appsList: async () => ({
        ok: true,
        data: [
          { id: "claude", label: "Claude Code" },
          { id: "opencode", label: "OpenCode" },
        ],
      }),
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      appsInstallCli,
    });
    render(Apps);

    const opencodeCard = within(await screen.findByTestId("app-opencode"));
    await fireEvent.click(opencodeCard.getByRole("button", { name: /install cli/i }));

    await waitFor(() => expect(appsInstallCli).toHaveBeenCalledWith("opencode"));
  });
});
