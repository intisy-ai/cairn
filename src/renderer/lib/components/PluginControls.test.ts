// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import type { PluginConfigSchema } from "@cairn/shared";
import PluginControls from "./PluginControls.svelte";

describe("PluginControls", () => {
  it("renders a declared select and writes the coerced value", async () => {
    const writes: unknown[][] = [];
    stubCairn({ configWrite: async (...args: unknown[]) => { writes.push(args); return { ok: true, data: undefined }; } });
    const schema: PluginConfigSchema = {
      plugin: "p", defaults: { mode: "fast" }, current: {},
      fields: [{ key: "mode", type: "select", label: "Mode", group: "Routing", options: [{ value: "fast", label: "Fast" }, { value: "cheap", label: "Cheap" }] }],
    };
    render(PluginControls, { homeId: "claude", schema });

    const select = (await screen.findByLabelText("p Mode")) as HTMLSelectElement;
    expect(select.value).toBe("fast");
    await fireEvent.change(select, { target: { value: "cheap" } });
    await waitFor(() => expect(writes).toContainEqual(["claude", "p", "mode", "cheap"]));
  });

  it("renders a number field honoring bounds and writes a number", async () => {
    const writes: unknown[][] = [];
    stubCairn({ configWrite: async (...args: unknown[]) => { writes.push(args); return { ok: true, data: undefined }; } });
    const schema: PluginConfigSchema = {
      plugin: "p", defaults: { level: 3 }, current: {},
      fields: [{ key: "level", type: "number", min: 1, max: 9, step: 1 }],
    };
    render(PluginControls, { homeId: "claude", schema });
    const input = (await screen.findByLabelText("p level")) as HTMLInputElement;
    expect(input.min).toBe("1");
    expect(input.max).toBe("9");
    await fireEvent.change(input, { target: { value: "7" } });
    await waitFor(() => expect(writes).toContainEqual(["claude", "p", "level", 7]));
  });

  it("falls back to type-inference when no fields are declared", async () => {
    const writes: unknown[][] = [];
    stubCairn({ configWrite: async (...args: unknown[]) => { writes.push(args); return { ok: true, data: undefined }; } });
    const schema: PluginConfigSchema = { plugin: "p", defaults: { enabled: true }, current: {} };
    render(PluginControls, { homeId: "claude", schema });
    const toggle = await screen.findByRole("switch", { name: "p enabled" });
    await fireEvent.click(toggle);
    await waitFor(() => expect(writes).toContainEqual(["claude", "p", "enabled", false]));
  });

  it("runs an action after confirming and shows its output", async () => {
    const action = vi.fn(async () => ({ ok: true, data: { stdout: "pinged", stderr: "" } }) as const);
    stubCairn({ configAction: action });
    const schema: PluginConfigSchema = {
      plugin: "p", defaults: {}, current: {},
      actions: [{ id: "ping", label: "Ping", confirm: "Send a ping?" }],
    };
    render(PluginControls, { homeId: "claude", schema });

    await fireEvent.click(await screen.findByRole("button", { name: "Ping" }));
    expect(action).not.toHaveBeenCalled();
    await fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(action).toHaveBeenCalledWith("claude", "p", "ping"));
    await waitFor(() => expect(screen.getByText("pinged")).toBeInTheDocument());
  });

  it("resolves a dot-path field's initial value from nested current/defaults", async () => {
    const writes: unknown[][] = [];
    stubCairn({ configWrite: async (...args: unknown[]) => { writes.push(args); return { ok: true, data: undefined }; } });
    const schema: PluginConfigSchema = {
      plugin: "p", defaults: { categories: { accounts: true } }, current: { categories: { accounts: false } },
      fields: [{ key: "categories.accounts", type: "boolean", label: "Accounts" }],
    };
    render(PluginControls, { homeId: "claude", schema });
    const toggle = await screen.findByRole("switch", { name: "p Accounts" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await fireEvent.click(toggle);
    await waitFor(() => expect(writes).toContainEqual(["claude", "p", "categories.accounts", true]));
  });

  it("adds a list item and writes the grown array", async () => {
    const writes: unknown[][] = [];
    stubCairn({ configWrite: async (...args: unknown[]) => { writes.push(args); return { ok: true, data: undefined }; } });
    const schema: PluginConfigSchema = {
      plugin: "p", defaults: { hooks: ["https://a"] }, current: {},
      fields: [{ key: "hooks", type: "list", itemType: "string", label: "Hooks" }],
    };
    render(PluginControls, { homeId: "claude", schema });
    await fireEvent.click(await screen.findByRole("button", { name: "+ Add" }));
    await waitFor(() => expect(writes).toContainEqual(["claude", "p", "hooks", ["https://a", ""]]));
  });
});
