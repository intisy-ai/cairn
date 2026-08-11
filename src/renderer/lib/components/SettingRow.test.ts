// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import SettingRow from "./SettingRow.svelte";

const control = createRawSnippet(() => ({ render: () => `<input id="c" />` }));

describe("SettingRow", () => {
  it("shows the name, the description and the control", () => {
    render(SettingRow, { name: "Sync across apps", description: "Mirror everything.", control });
    expect(screen.getByText("Sync across apps")).toBeInTheDocument();
    expect(screen.getByText("Mirror everything.")).toBeInTheDocument();
    expect(document.querySelector("#c")).toBeTruthy();
  });

  it("ties the name to the control when one has an id, so clicking it focuses the control", () => {
    render(SettingRow, { name: "Keep at most", controlId: "c", control });
    expect(screen.getByText("Keep at most").getAttribute("for")).toBe("c");
  });

  it("leaves the name unlinked for a control that labels itself", () => {
    render(SettingRow, { name: "Enabled", control });
    expect(screen.getByText("Enabled").tagName).toBe("SPAN");
  });

  it("shows a note only when there is one, in the tone asked for", () => {
    const { unmount } = render(SettingRow, { name: "A", control });
    expect(document.querySelector(".note")).toBeNull();
    unmount();

    render(SettingRow, { name: "A", note: "Saved", tone: "good", control });
    expect(document.querySelector(".note")?.classList.contains("good")).toBe(true);
  });
});
