// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import SegmentedControl from "./SegmentedControl.svelte";

const options = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On" },
  { value: "off", label: "Off", disabled: true },
];

describe("SegmentedControl", () => {
  it("reflects the selected option via aria-pressed", () => {
    const { getByRole } = render(SegmentedControl, { props: { options, value: "on", onChange: vi.fn(), label: "Mode" } });
    expect(getByRole("button", { name: "Auto" }).getAttribute("aria-pressed")).toBe("false");
    expect(getByRole("button", { name: "On" }).getAttribute("aria-pressed")).toBe("true");
    expect(getByRole("button", { name: "Off" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("calls onChange with the clicked option's value", async () => {
    const onChange = vi.fn();
    const { getByRole } = render(SegmentedControl, { props: { options, value: "on", onChange, label: "Mode" } });
    await fireEvent.click(getByRole("button", { name: "Auto" }));
    expect(onChange).toHaveBeenCalledWith("auto");
  });

  it("does not call onChange when a disabled option is clicked", async () => {
    const onChange = vi.fn();
    const { getByRole } = render(SegmentedControl, { props: { options, value: "on", onChange, label: "Mode" } });
    await fireEvent.click(getByRole("button", { name: "Off" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("exposes the label as the group's accessible name", () => {
    const { getByRole } = render(SegmentedControl, { props: { options, value: "on", onChange: vi.fn(), label: "Mode" } });
    expect(getByRole("group", { name: "Mode" })).toBeTruthy();
  });
});
