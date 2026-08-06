// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import AppPills from "./AppPills.svelte";

const DATA_URI = "data:image/svg+xml;base64,PHN2Zy8+";

describe("AppPills", () => {
  // An app's icon is a data URI. Inlining it as HTML printed the literal "data:image/..."
  // text into a 26px box, which read as a broken "data" label instead of a logo.
  it("renders an app's icon as an image, not as inline markup", () => {
    const { container } = render(AppPills, {
      props: { apps: [{ id: "claude", label: "Claude Code", icon: DATA_URI }], values: { claude: true } },
    });
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe(DATA_URI);
    expect(container.textContent?.trim()).toBe("");
  });

  it("falls back to a lettermark when an app supplies no icon", () => {
    const { container } = render(AppPills, {
      props: { apps: [{ id: "mystery", label: "Mystery App" }], values: {} },
    });
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".lettermark")).toHaveTextContent("M");
  });

  it("marks an app the provider is not exposed to", () => {
    const { container } = render(AppPills, {
      props: { apps: [{ id: "a", label: "A", icon: DATA_URI }, { id: "b", label: "B", icon: DATA_URI }], values: { a: true } },
    });
    expect(container.querySelectorAll(".app.on")).toHaveLength(1);
    expect(container.querySelectorAll(".app.na")).toHaveLength(1);
  });

  it("toggles the app it was clicked on", async () => {
    const onToggle = vi.fn();
    const { getByRole } = render(AppPills, {
      props: { apps: [{ id: "claude", label: "Claude Code", icon: DATA_URI }], values: {}, onToggle },
    });
    await fireEvent.click(getByRole("button"));
    expect(onToggle).toHaveBeenCalledWith("claude", true);
  });
});
