// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import ScreenRenderer from "./ScreenRenderer.svelte";

function ctx(sources: Record<string, unknown>, invoke = vi.fn(async () => {})) {
  return { plugin: "p", screenId: "s", homeId: "claude", sources, invoke, busy: false };
}

describe("data leaves", () => {
  it("renders a stat per summary entry", () => {
    render(ScreenRenderer, { node: { kind: "stats", source: "summary" }, ctx: ctx({ summary: [{ id: "a", label: "Pending", value: 3 }] }) });
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("groups table rows by the declared key", () => {
    const node = { kind: "table", source: "rows", groupBy: "file", columns: [{ key: "key" }] };
    render(ScreenRenderer, { node, ctx: ctx({ rows: [{ id: "1", file: "settings.json", key: "theme" }, { id: "2", file: "settings.json", key: "font" }] }) });
    expect(screen.getByText("settings.json")).toBeInTheDocument();
    expect(screen.getByText("theme")).toBeInTheDocument();
  });

  it("shows the declared empty text for an empty collection", () => {
    render(ScreenRenderer, { node: { kind: "table", source: "rows", empty: "Nothing pending.", columns: [] }, ctx: ctx({ rows: [] }) });
    expect(screen.getByText("Nothing pending.")).toBeInTheDocument();
  });

  it("invokes a row action with that row's id", async () => {
    const invoke = vi.fn(async () => {});
    const node = { kind: "list", source: "rows", rowActions: ["restore"], item: { title: "subject" } };
    render(ScreenRenderer, { node, ctx: ctx({ rows: [{ id: "a1b2", subject: "manual snapshot" }] }, invoke) });
    await fireEvent.click(screen.getByRole("button", { name: "restore" }));
    expect(invoke).toHaveBeenCalledWith("restore", { id: "a1b2" });
  });

  it("invokes a chip's select action with the chip's id", async () => {
    const invoke = vi.fn(async () => {});
    render(ScreenRenderer, { node: { kind: "chips", source: "profiles", select: "profileSwitch" }, ctx: ctx({ profiles: [{ id: "work", label: "work", current: false }] }, invoke) });
    await fireEvent.click(screen.getByRole("button", { name: "work" }));
    expect(invoke).toHaveBeenCalledWith("profileSwitch", { id: "work" });
  });

  it("submits a form's typed values under their field keys", async () => {
    const invoke = vi.fn(async () => {});
    const node = { kind: "form", submit: "commit", fields: [{ key: "reason", type: "string", label: "Note" }] };
    render(ScreenRenderer, { node, ctx: ctx({}, invoke) });
    await fireEvent.input(screen.getByLabelText("Note"), { target: { value: "before upgrade" } });
    await fireEvent.click(screen.getByRole("button", { name: "commit" }));
    expect(invoke).toHaveBeenCalledWith("commit", { reason: "before upgrade" });
  });

  it("renders a banner only when its source has text", () => {
    const { unmount } = render(ScreenRenderer, { node: { kind: "banner", source: "notice" }, ctx: ctx({ notice: "" }) });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    render(ScreenRenderer, { node: { kind: "banner", source: "notice" }, ctx: ctx({ notice: "uncommitted changes" }) });
    expect(screen.getByRole("status")).toHaveTextContent("uncommitted changes");
  });
});
