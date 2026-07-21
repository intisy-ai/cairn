// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, waitFor, within } from "@testing-library/svelte";
import { stubIntisy } from "../testing.js";
import Usage from "./Usage.svelte";

describe("Usage screen", () => {
  it("renders account count and the honest empty-sessions state, without fabricating session data", async () => {
    stubIntisy({
      usageSnapshot: async () => ({
        ok: true,
        data: {
          accounts: [
            { provider: "stub", id: "a1" },
            { provider: "stub", id: "a2" },
          ],
          sessions: [],
          models: {},
          updatedAt: "2026-07-21T00:00:00.000Z",
        },
      }),
    });

    const { getByText, getAllByText, queryByText } = render(Usage);

    await waitFor(() => expect(getByText("Accounts tracked")).toBeTruthy());
    const accountsStat = getByText("Accounts tracked").closest(".stat") as HTMLElement;
    expect(within(accountsStat).getByText("2")).toBeTruthy();
    expect(getAllByText(/metric-dashboard/i).length).toBeGreaterThan(0);
    expect(queryByText(/\$/)).toBeNull();
    expect(queryByText(/tokens?/i)).toBeNull();
  });

  it("shows an inline error when usageSnapshot fails", async () => {
    stubIntisy({ usageSnapshot: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Usage);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });
});
