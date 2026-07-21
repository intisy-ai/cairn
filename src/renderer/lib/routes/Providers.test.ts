// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { stubIntisy } from "../testing.js";
import Providers from "./Providers.svelte";

describe("Providers screen", () => {
  it("renders a provider row from providersList and toggles exposure", async () => {
    const providersSetExposure = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubIntisy({
      providersList: async () => ({
        ok: true,
        data: [
          { id: "stub", label: "Stub", hasOAuth: true, accountCount: 2, active: true, exposure: { cc: true, oc: false } },
        ],
      }),
      providersSetExposure,
    });

    const { getByText, getByRole } = render(Providers);

    await waitFor(() => expect(getByText("Stub")).toBeTruthy());
    expect(getByText(/2 accounts/i)).toBeTruthy();

    const ccPill = getByText("CC");
    const ocPill = getByText("OC");
    expect(ccPill.classList.contains("on")).toBe(true);
    expect(ocPill.classList.contains("na")).toBe(true);

    const enabledSwitch = getByRole("switch", { name: /Stub enabled/i });
    expect(enabledSwitch.getAttribute("aria-checked")).toBe("true");

    await fireEvent.click(ocPill);
    expect(providersSetExposure).toHaveBeenCalledWith("stub", "oc", true);
  });

  it("shows an inline error when providersList fails", async () => {
    stubIntisy({ providersList: async () => ({ ok: false, error: "boom" }) });
    const { getByText } = render(Providers);
    await waitFor(() => expect(getByText(/boom/i)).toBeTruthy());
  });
});
