// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import TestWrapper from "./CollapsibleGroup.test.svelte";

describe("CollapsibleGroup", () => {
  it("renders label, count, and body text; toggles aria-expanded and hides body on click", async () => {
    const { getByRole, getByText, queryByText } = render(TestWrapper);

    const header = getByRole("button");
    expect(header.getAttribute("aria-label")).toBe("Toggle Connected section");
    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(getByText("Connected")).toBeInTheDocument();
    expect(getByText("3")).toBeInTheDocument();
    expect(getByText("Test body content")).toBeInTheDocument();

    await fireEvent.click(header);

    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(queryByText("Test body content")).not.toBeInTheDocument();

    await fireEvent.click(header);

    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(getByText("Test body content")).toBeInTheDocument();
  });
});
