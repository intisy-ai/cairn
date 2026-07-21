// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Chip from "./Chip.svelte";

describe("Chip", () => {
  it("adds the on class when on is true", () => {
    const { getByRole } = render(Chip, { props: { label: "All", on: true } });
    expect(getByRole("button").classList.contains("on")).toBe(true);
  });

  it("omits the on class when on is false", () => {
    const { getByRole } = render(Chip, { props: { label: "Connected", on: false } });
    expect(getByRole("button").classList.contains("on")).toBe(false);
  });
});
