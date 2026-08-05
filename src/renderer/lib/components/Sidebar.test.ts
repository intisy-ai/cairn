// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import { stubCairn } from "../testing.js";
import { router, navigate } from "../router.js";
import Sidebar from "./Sidebar.svelte";

describe("Sidebar", () => {
  it("hides the Routing nav item when hasRouting is false", () => {
    stubCairn();
    const { queryByText } = render(Sidebar, { props: { hasRouting: false } });
    expect(queryByText("Routing")).toBeNull();
  });

  it("shows the Routing nav item when hasRouting is true", () => {
    stubCairn();
    const { getByText } = render(Sidebar, { props: { hasRouting: true } });
    expect(getByText("Routing")).toBeTruthy();
  });
});

describe("contributed menus", () => {
  it("renders a nav item per contributed menu, with its declared label and glyph", async () => {
    stubCairn({ menusList: async () => ({ ok: true, data: [{ plugin: "config-ledger", label: "Ledger", glyph: "@", homes: ["claude"] }] }) });
    render(Sidebar, { props: { hasRouting: true } });

    const button = await screen.findByRole("button", { name: /Ledger/ });
    expect(button.textContent).toContain("@");
  });

  it("navigates to that plugin's own screen when the item is pressed", async () => {
    stubCairn({ menusList: async () => ({ ok: true, data: [{ plugin: "config-ledger", label: "Ledger", homes: ["claude"] }] }) });
    render(Sidebar, { props: { hasRouting: true } });

    await fireEvent.click(await screen.findByRole("button", { name: /Ledger/ }));
    expect(get(router).screen).toBe("plugin:config-ledger");
    navigate("overview");
  });

  it("shows no plugin section at all when nothing contributes a menu", async () => {
    stubCairn({ menusList: async () => ({ ok: true, data: [] }) });
    render(Sidebar, { props: { hasRouting: true } });

    await waitFor(() => expect(screen.getByText("Network")).toBeInTheDocument());
    expect(screen.queryByText("Plugins", { selector: "p" })).toBeNull();
  });
});

describe("menu painting", () => {
  it("paints cached menus first, then replaces them when the refresh lands", async () => {
    const calls: (boolean | undefined)[] = [];
    stubCairn({
      menusList: async (opts?: { wait?: boolean }) => {
        calls.push(opts?.wait);
        return opts?.wait
          ? { ok: true as const, data: [{ plugin: "ledger", label: "Fresh", homes: ["claude"] }] }
          : { ok: true as const, data: [{ plugin: "ledger", label: "Cached", homes: ["claude"] }] };
      },
    });
    render(Sidebar, { props: { hasRouting: true } });

    expect(await screen.findByRole("button", { name: /Cached/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Fresh/ })).toBeInTheDocument();
    expect(calls).toEqual([undefined, true]);
    navigate("overview");
  });

  it("still shows the refreshed menus when the cache was cold", async () => {
    stubCairn({
      menusList: async (opts?: { wait?: boolean }) => (opts?.wait
        ? { ok: true as const, data: [{ plugin: "ledger", label: "Ledger", homes: ["claude"] }] }
        : { ok: true as const, data: [] }),
    });
    render(Sidebar, { props: { hasRouting: true } });

    expect(await screen.findByRole("button", { name: /Ledger/ })).toBeInTheDocument();
  });
});
