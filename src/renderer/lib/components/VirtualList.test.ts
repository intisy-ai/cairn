// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import { createRawSnippet, tick } from "svelte";
import VirtualList from "./VirtualList.svelte";

interface Row {
  id: number;
  label: string;
}

function makeItems(count: number): Row[] {
  return Array.from({ length: count }, (_, i) => ({ id: i, label: `Row ${i}` }));
}

const rowSnippet = createRawSnippet<[Row, number]>((getItem, getIndex) => ({
  render: () => {
    const item = getItem();
    const index = getIndex();
    return `<div data-testid="vrow-${index}">${item.label}</div>`;
  },
}));

describe("VirtualList", () => {
  it("renders only a small windowed subset of a large list", () => {
    const items = makeItems(1000);
    const { container, queryByTestId } = render(VirtualList, {
      props: {
        items,
        rowHeight: 20,
        viewportHeight: 200,
        row: rowSnippet,
      },
    });

    const rendered = container.querySelectorAll("[data-testid^='vrow-']");
    expect(rendered.length).toBeLessThan(50);

    expect(queryByTestId("vrow-0")).not.toBeNull();
    expect(queryByTestId("vrow-900")).toBeNull();

    const spacer = container.querySelector(".spacer") as HTMLElement;
    expect(spacer.style.height).toBe(`${1000 * 20}px`);
  });

  it("recomputes the visible window when scrolled", async () => {
    const items = makeItems(1000);
    const { container, queryByTestId } = render(VirtualList, {
      props: {
        items,
        rowHeight: 20,
        viewportHeight: 200,
        row: rowSnippet,
      },
    });

    const viewport = container.querySelector(".vp") as HTMLElement;
    viewport.scrollTop = 18000;
    viewport.dispatchEvent(new Event("scroll"));
    await tick();

    expect(queryByTestId("vrow-900")).not.toBeNull();
  });
});
