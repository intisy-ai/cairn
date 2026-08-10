// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import TestWrapper from "./ItemBox.test.svelte";

describe("ItemBox", () => {
  it("renders the title, subtitle and every slot", () => {
    const { getByText, getByTestId } = render(TestWrapper);

    expect(getByText("Antigravity")).toBeInTheDocument();
    expect(getByText("3 accounts")).toBeInTheDocument();
    expect(getByTestId("icon")).toBeInTheDocument();
    expect(getByTestId("badge")).toBeInTheDocument();
    expect(getByTestId("action")).toBeInTheDocument();
    expect(getByTestId("corner")).toBeInTheDocument();
  });

  it("opens on click only when onOpen is given", async () => {
    const onOpen = vi.fn();
    const { getByRole } = render(TestWrapper, { props: { onOpen } });

    await fireEvent.click(getByRole("button", { name: /Antigravity/ }));

    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("leaves the content unfocusable when it cannot be opened", () => {
    const { queryByRole } = render(TestWrapper);

    expect(queryByRole("button")).toBeNull();
  });

  it("keeps a card's actions in a footer and a row's actions beside the content", () => {
    const grid = render(TestWrapper, { props: { view: "grid" } });
    expect(grid.getByTestId("action").parentElement).toHaveClass("footer");
    grid.unmount();

    const list = render(TestWrapper);
    expect(list.getByTestId("action").parentElement).toHaveClass("actions");
  });

  it("makes each action its own cell when columns line the list up", () => {
    const { getByTestId } = render(TestWrapper, { props: { columns: "1fr auto" } });

    expect(getByTestId("action").parentElement).toHaveAttribute("data-testid", "box");
  });
});
