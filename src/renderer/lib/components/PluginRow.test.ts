// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import PluginRow from "./PluginRow.svelte";

describe("PluginRow", () => {
  it("renders the name and kind with version", () => {
    const { getByText } = render(PluginRow, {
      props: {
        name: "test-plugin",
        kind: "npm",
        installedVersion: "1.2.3",
        updateAvailable: false,
        enabled: true,
      },
    });
    expect(getByText("test-plugin")).toBeInTheDocument();
    expect(getByText("npm · v1.2.3")).toBeInTheDocument();
  });

  it("renders catalogKind='provider' as PROVIDER chip", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-provider",
        kind: "npm",
        installedVersion: "1.0.0",
        updateAvailable: false,
        enabled: true,
        catalogKind: "provider",
      },
    });
    const chip = container.querySelector(".chip");
    expect(chip).toBeInTheDocument();
    expect(chip?.textContent?.toLowerCase()).toBe("provider");
  });

  it("renders catalogKind='proxy' as PROXY chip", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-proxy",
        kind: "git",
        installedVersion: "2.0.0",
        updateAvailable: false,
        enabled: true,
        catalogKind: "proxy",
      },
    });
    const chip = container.querySelector(".chip");
    expect(chip).toBeInTheDocument();
    expect(chip?.textContent?.toLowerCase()).toBe("proxy");
  });

  it("does not render chip for catalogKind='plugin'", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-plugin",
        kind: "npm",
        installedVersion: "1.0.0",
        updateAvailable: false,
        enabled: true,
        catalogKind: "plugin",
      },
    });
    const chip = container.querySelector(".chip");
    expect(chip).not.toBeInTheDocument();
  });

  it("does not render chip when catalogKind is undefined", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-plugin",
        kind: "npm",
        installedVersion: "1.0.0",
        updateAvailable: false,
        enabled: true,
      },
    });
    const chip = container.querySelector(".chip");
    expect(chip).not.toBeInTheDocument();
  });

  it("renders chip alongside the update pill", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-provider",
        kind: "npm",
        installedVersion: "1.0.0",
        updateAvailable: true,
        enabled: true,
        catalogKind: "provider",
      },
    });
    const chip = container.querySelector(".chip");
    const statusPill = container.querySelector('[class*="StatusPill"]');
    expect(chip).toBeInTheDocument();
    expect(statusPill || container.textContent?.includes("Update available")).toBeTruthy();
  });

  it("renders chip alongside the deprecated pill", () => {
    const { container } = render(PluginRow, {
      props: {
        name: "test-proxy",
        kind: "git",
        installedVersion: "1.0.0",
        updateAvailable: false,
        enabled: true,
        deprecated: true,
        catalogKind: "proxy",
      },
    });
    const chip = container.querySelector(".chip");
    const statusPill = container.querySelector('[class*="StatusPill"]');
    expect(chip).toBeInTheDocument();
    expect(statusPill || container.textContent?.includes("Deprecated")).toBeTruthy();
  });
});
