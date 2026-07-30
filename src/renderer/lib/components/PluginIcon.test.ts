// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PluginIcon, { LOGO_SIZE } from "./PluginIcon.svelte";

describe("PluginIcon", () => {
  it("renders an img when an icon data URI is given", () => {
    const { container } = render(PluginIcon, { props: { icon: "data:image/svg+xml;base64,abc", name: "wakatime-sync" } });
    const img = container.querySelector("img.icon");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("data:image/svg+xml;base64,abc");
  });

  it("renders the icon in a fixed square box at the requested size", () => {
    const { container } = render(PluginIcon, { props: { icon: "data:image/svg+xml;base64,abc", name: "x", size: LOGO_SIZE.detail } });
    const img = container.querySelector("img.icon") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe(String(LOGO_SIZE.detail));
    expect(img.getAttribute("height")).toBe(String(LOGO_SIZE.detail));
    expect(img.style.width).toBe(LOGO_SIZE.detail + "px");
    expect(img.style.height).toBe(LOGO_SIZE.detail + "px");
  });

  it("defaults to the canonical list size", () => {
    const { container } = render(PluginIcon, { props: { icon: "data:image/svg+xml;base64,abc", name: "x" } });
    const img = container.querySelector("img.icon") as HTMLImageElement;
    expect(img.getAttribute("width")).toBe(String(LOGO_SIZE.list));
  });

  it("renders a lettermark with the first letter when no icon", () => {
    const { container } = render(PluginIcon, { props: { icon: "", name: "sync-bridge" } });
    expect(container.querySelector("img.icon")).toBeNull();
    const mark = container.querySelector(".lettermark");
    expect(mark?.textContent).toBe("S");
  });
});
