// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import Spinner from "./Spinner.svelte";

describe("Spinner", () => {
  it("renders an svg at the requested size", () => {
    const { getByTestId } = render(Spinner, { props: { size: 20 } });
    const svg = getByTestId("spinner");
    expect(svg.getAttribute("width")).toBe("20");
  });
});
