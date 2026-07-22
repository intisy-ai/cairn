// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { stubCairn } from "./testing.js";
import { cairn } from "./ipc.js";
import Overview from "./routes/Overview.svelte";

describe("cairn proxy", () => {
  it("reads window.cairn lazily, so a stub installed after import still resolves", async () => {
    stubCairn({
      overviewSummary: async () => ({
        ok: true,
        data: { providersConnected: 3, accountsTotal: 5, serverRunning: true, serverPort: 34567 },
      }),
    });

    const result = await cairn.overviewSummary();
    expect(result).toEqual({
      ok: true,
      data: { providersConnected: 3, accountsTotal: 5, serverRunning: true, serverPort: 34567 },
    });
  });

  it("lets a component that imported { cairn } before the stub see the stubbed value", async () => {
    stubCairn({
      overviewSummary: async () => ({
        ok: true,
        data: { providersConnected: 7, accountsTotal: 9, serverRunning: false, serverPort: 34567 },
      }),
    });

    const { getByText } = render(Overview);

    await waitFor(() => {
      expect(getByText("7")).toBeTruthy();
      expect(getByText("9")).toBeTruthy();
    });
  });
});
