// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import ScreenRenderer from "./ScreenRenderer.svelte";
import { styleOf } from "./registry.js";

const ctx = { plugin: "p", screenId: "s", homeId: "claude", sources: {}, invoke: async () => {}, busy: false };

describe("ScreenRenderer", () => {
  it("renders a card's title and its children", () => {
    render(ScreenRenderer, { node: { kind: "card", title: "History", children: [{ kind: "text", text: "inside" }] }, ctx });
    expect(screen.getByText("History")).toBeInTheDocument();
    expect(screen.getByText("inside")).toBeInTheDocument();
  });

  it("shows only the selected tab's child", async () => {
    render(ScreenRenderer, { node: { kind: "tabs", tabs: [
      { id: "a", label: "First", child: { kind: "text", text: "one" } },
      { id: "b", label: "Second", child: { kind: "text", text: "two" } },
    ] }, ctx });
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.queryByText("two")).not.toBeInTheDocument();
  });

  it("skips an unknown kind instead of throwing", () => {
    render(ScreenRenderer, { node: { kind: "stack", children: [{ kind: "sparkline" }, { kind: "text", text: "still here" }] }, ctx });
    expect(screen.getByText("still here")).toBeInTheDocument();
  });

  it("turns a style bag into declarations, ignoring what it does not know", () => {
    expect(styleOf({ width: "220px", grow: 1, align: "center" })).toBe("width:220px;flex-grow:1;align-items:center");
    expect(styleOf(undefined)).toBe("");
  });
});
