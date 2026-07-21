// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, waitFor, within } from "@testing-library/svelte";
import { stubIntisy } from "../testing.js";
import Usage from "./Usage.svelte";

describe("Usage screen", () => {
  it("renders real session and model rows with correct token totals, never fabricating cost", async () => {
    stubIntisy({
      usageSnapshot: async () => ({
        ok: true,
        data: {
          accounts: [
            { provider: "stub", id: "a1" },
            { provider: "stub", id: "a2" },
          ],
          sessions: [
            {
              id: "sess1",
              title: "my test project",
              tokens: { input: 1000, output: 200, reasoning: 0, cacheRead: 50, cacheWrite: 10 },
              messageCount: 2,
              source: "claude-code",
              updated: new Date("2026-07-20T00:00:00.000Z").getTime(),
            },
          ],
          models: {
            "claude-sonnet-5": {
              provider: "anthropic",
              tokens: { input: 1000, output: 200, reasoning: 0 },
              sessionCount: 1,
              messageCount: 2,
            },
          },
          updatedAt: "2026-07-21T00:00:00.000Z",
        },
      }),
    });

    const { getByText, getAllByText, queryByText } = render(Usage);

    await waitFor(() => expect(getByText("Accounts tracked")).toBeTruthy());
    const accountsStat = getByText("Accounts tracked").closest(".stat") as HTMLElement;
    expect(within(accountsStat).getByText("2")).toBeTruthy();

    const sessionsLabel = getAllByText("Sessions").find((el) => el.closest(".stat")) as HTMLElement;
    const sessionsStat = sessionsLabel.closest(".stat") as HTMLElement;
    expect(within(sessionsStat).getByText("1")).toBeTruthy();

    const tokensStat = getByText("Total tokens").closest(".stat") as HTMLElement;
    expect(within(tokensStat).getByText("1,200")).toBeTruthy();

    expect(getByText("my test project")).toBeTruthy();
    expect(getByText(/Claude Code .* 1,200 tokens .* 2 messages .* 2026-07-20/)).toBeTruthy();

    expect(getByText("claude-sonnet-5")).toBeTruthy();
    expect(getByText(/anthropic .* 1,200 tokens .* 1 session/)).toBeTruthy();

    expect(queryByText(/\$/)).toBeNull();
  });

  it("shows honest empty states when no sessions or models are present", async () => {
    stubIntisy({
      usageSnapshot: async () => ({
        ok: true,
        data: { accounts: [], sessions: [], models: {}, updatedAt: "2026-07-21T00:00:00.000Z" },
      }),
    });

    const { getByText } = render(Usage);
    await waitFor(() => expect(getByText("No sessions found")).toBeTruthy());
    expect(getByText("No model usage yet")).toBeTruthy();
    expect(getByText("No accounts yet")).toBeTruthy();
  });

  it("shows an inline error when usageSnapshot fails", async () => {
    stubIntisy({ usageSnapshot: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Usage);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });
});
