// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, within } from "@testing-library/svelte";
import { stubIntisy } from "../testing.js";
import Routing from "./Routing.svelte";

const CATALOG = [
  { provider: "stub", model: "m1", name: "Stub M1" },
  { provider: "stub", model: "m2", name: "Stub M2" },
];

describe("Routing screen", () => {
  it("renders a tier with its current chain", async () => {
    stubIntisy({
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

  it("calls routingSetChain when adding a model to an empty tier", async () => {
    const routingSetChain = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubIntisy({
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

    await waitFor(() => expect(routingSetChain).toHaveBeenCalledWith("opus", [{ provider: "stub", model: "m1" }]));
  });

  it("shows an inline error when routingGet fails", async () => {
    stubIntisy({ routingGet: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Routing);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });
});
