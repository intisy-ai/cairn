// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import ToggleSwitch from "./ToggleSwitch.svelte";

describe("ToggleSwitch", () => {
  it("toggles aria-checked and fires onchange", async () => {
    let latest: boolean | undefined;
    const { getByRole } = render(ToggleSwitch, {
      props: {
        checked: false,
        label: "Test toggle",
        onchange: (next: boolean) => {
          latest = next;
        },
      },
    });

    const switchEl = getByRole("switch");
    expect(switchEl.getAttribute("aria-checked")).toBe("false");

    await fireEvent.click(switchEl);

    expect(switchEl.getAttribute("aria-checked")).toBe("true");
    expect(latest).toBe(true);
  });
});
