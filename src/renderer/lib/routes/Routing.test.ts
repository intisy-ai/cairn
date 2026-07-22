// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Routing from "./Routing.svelte";

const CATALOG = [
  { provider: "stub", model: "m1", name: "Stub M1" },
  { provider: "stub", model: "m2", name: "Stub M2" },
];

const ONE_APP = [{ app: "claude" as const, label: "Claude Code" }];
const TWO_APPS = [
  { app: "claude" as const, label: "Claude Code" },
  { app: "opencode" as const, label: "OpenCode" },
];

describe("Routing screen", () => {
  it("renders a tier with its current chain", async () => {
    stubCairn({
      routingApps: async () => ({ ok: true, data: ONE_APP }),
      routingGet: async () => ({
        ok: true,
        data: {
          tiers: ["opus"],
          map: { default: [], opus: [{ provider: "stub", model: "m1", name: "Stub M1" }] },
          catalog: CATALOG,
        },
      }),
    });

    const { getByText } = render(Routing);

    await waitFor(() => expect(getByText("opus")).toBeTruthy());
    expect(getByText("Stub M1")).toBeTruthy();
    expect(getByText("stub")).toBeTruthy();
  });

  it("calls routingSetChain with the current app when adding a model to an empty tier", async () => {
    const routingSetChain = vi.fn(async () => ({ ok: true, data: { warnings: [] } }) as const);
    stubCairn({
      routingApps: async () => ({ ok: true, data: ONE_APP }),
      routingGet: async () => ({
        ok: true,
        data: {
          tiers: ["opus"],
          map: { default: [], opus: [] },
          catalog: CATALOG,
        },
      }),
      routingSetChain,
    });

    const { getByLabelText, getByText } = render(Routing);

    await waitFor(() => expect(getByText("opus")).toBeTruthy());

    const select = getByLabelText("Add model to opus") as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: "stub|m1" } });
    const addRow = select.closest(".add-row") as HTMLElement;
    await fireEvent.click(within(addRow).getByText("Add"));

    await waitFor(() =>
      expect(routingSetChain).toHaveBeenCalledWith("claude", "opus", [{ provider: "stub", model: "m1" }]),
    );
  });

  it("shows an inline error when routingGet fails", async () => {
    stubCairn({
      routingApps: async () => ({ ok: true, data: ONE_APP }),
      routingGet: async () => ({ ok: false, error: "boom" }),
    });
    const { getByText } = render(Routing);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });

  it("surfaces warnings returned from routingSetChain", async () => {
    stubCairn({
      routingApps: async () => ({ ok: true, data: ONE_APP }),
      routingGet: async () => ({
        ok: true,
        data: { tiers: ["opus"], map: { default: [], opus: [] }, catalog: CATALOG },
      }),
      routingSetChain: async () => ({ ok: true, data: { warnings: ["provider stub is disabled"] } }),
    });

    const { getByLabelText, getByText } = render(Routing);
    await waitFor(() => expect(getByText("opus")).toBeTruthy());

    const select = getByLabelText("Add model to opus") as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: "stub|m1" } });
    const addRow = select.closest(".add-row") as HTMLElement;
    await fireEvent.click(within(addRow).getByText("Add"));

    await waitFor(() => expect(getByText(/provider stub is disabled/i)).toBeTruthy());
  });

  it("renders a switcher with all app labels when more than one app is available", async () => {
    stubCairn({
      routingApps: async () => ({ ok: true, data: TWO_APPS }),
      routingGet: async () => ({
        ok: true,
        data: { tiers: [], map: { default: [] }, catalog: CATALOG },
      }),
    });

    const { getByText } = render(Routing);

    await waitFor(() => {
      expect(getByText("Claude Code")).toBeTruthy();
      expect(getByText("OpenCode")).toBeTruthy();
    });
  });

  it("switches app and reloads routing when a switcher tab is clicked", async () => {
    const routingGet = vi.fn(async (app: string) => ({
      ok: true,
      data: { tiers: [`${app}-tier`], map: { default: [] }, catalog: CATALOG },
    }));
    stubCairn({
      routingApps: async () => ({ ok: true, data: TWO_APPS }),
      routingGet: routingGet as unknown as Parameters<typeof stubCairn>[0]["routingGet"],
    });

    const { getByText } = render(Routing);

    await waitFor(() => expect(getByText("claude-tier")).toBeTruthy());

    await fireEvent.click(getByText("OpenCode"));

    await waitFor(() => expect(getByText("opencode-tier")).toBeTruthy());
    expect(routingGet).toHaveBeenCalledWith("opencode");
  });

  it("shows an empty state when no app has a proxy plugin installed", async () => {
    stubCairn({ routingApps: async () => ({ ok: true, data: [] }) });

    const { getByText } = render(Routing);

    await waitFor(() => expect(getByText(/Install a proxy plugin/i)).toBeTruthy());
  });
});
