// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Skeleton from "./Skeleton.svelte";

describe("Skeleton", () => {
  it("renders a single block by default", () => {
    const { getAllByTestId } = render(Skeleton);
    expect(getAllByTestId("skeleton").length).toBe(1);
  });

  it("renders the requested number of lines", () => {
    const { container } = render(Skeleton, { props: { lines: 3 } });
    expect(container.querySelectorAll(".sk").length).toBe(3);
  });
});
