// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import TestWrapper from "./ItemList.test.svelte";

describe("ItemList", () => {
  it("renders every item in list view", () => {
    const { getByTestId } = render(TestWrapper);

    expect(getByTestId("items")).toBeInTheDocument();
    expect(getByTestId("item-0")).toBeInTheDocument();
    expect(getByTestId("item-2")).toBeInTheDocument();
  });

  it("shows the empty snippet instead of an empty container", () => {
    const { getByTestId, queryByTestId } = render(TestWrapper, { props: { count: 0 } });

    expect(getByTestId("empty")).toBeInTheDocument();
    expect(queryByTestId("item-0")).toBeNull();
  });

  it("windows the list once it grows past the virtualization threshold", () => {
    const { queryByTestId } = render(TestWrapper, { props: { count: 200 } });

    expect(queryByTestId("item-0")).toBeInTheDocument();
    expect(queryByTestId("item-199")).toBeNull();
  });

  it("renders a card grid in grid view", () => {
    const { getByTestId } = render(TestWrapper, { props: { view: "grid" } });

    expect(getByTestId("items")).toHaveClass("grid");
  });
});
