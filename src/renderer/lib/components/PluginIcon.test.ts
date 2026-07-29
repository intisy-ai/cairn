// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PluginIcon from "./PluginIcon.svelte";

describe("PluginIcon", () => {
  it("renders an img when an icon data URI is given", () => {
    const { container } = render(PluginIcon, { props: { icon: "data:image/svg+xml;base64,abc", name: "wakatime-sync" } });
    const img = container.querySelector("img.icon");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("data:image/svg+xml;base64,abc");
  });

  it("renders a lettermark with the first letter when no icon", () => {
    const { container } = render(PluginIcon, { props: { icon: "", name: "sync-bridge" } });
    expect(container.querySelector("img.icon")).toBeNull();
    const mark = container.querySelector(".lettermark");
    expect(mark?.textContent).toBe("S");
  });
});
