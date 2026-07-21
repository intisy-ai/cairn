// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import { stubIntisy } from "./testing.js";
import { intisy } from "./ipc.js";
import Overview from "./routes/Overview.svelte";

describe("intisy proxy", () => {
  it("reads window.intisy lazily, so a stub installed after import still resolves", async () => {
    stubIntisy({
      overviewSummary: async () => ({
        ok: true,
        data: { providersConnected: 3, accountsTotal: 5, serverRunning: true, serverPort: 34567 },
      }),
    });

    const result = await intisy.overviewSummary();
    expect(result).toEqual({
      ok: true,
      data: { providersConnected: 3, accountsTotal: 5, serverRunning: true, serverPort: 34567 },
    });
  });

  it("lets a component that imported { intisy } before the stub see the stubbed value", async () => {
    stubIntisy({
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
