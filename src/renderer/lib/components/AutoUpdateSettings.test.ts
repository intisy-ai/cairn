// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";

const configWrite = vi.fn(async () => ({ ok: true as const, data: undefined }));
const configSchemas = vi.fn(async () => ({
  ok: true as const,
  data: [
    {
      plugin: "plugin-updater",
      defaults: { auto_update_mode: "update", auto_update_triggers: { loader: true, app: true, cairn: true } },
      current: { auto_update_mode: "check", auto_update_triggers: { loader: true, app: true, cairn: true } },
    },
  ],
}));

vi.mock("../ipc.js", () => ({
  cairn: {
    get configSchemas() { return configSchemas; },
    get configWrite() { return configWrite; },
  },
}));

beforeEach(() => {
  configWrite.mockClear();
  configSchemas.mockClear();
});

describe("AutoUpdateSettings", () => {
  it("shows the mode this app home has on disk", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude" } });

    await waitFor(() => expect(getByLabelText("Automatic updates")).toHaveValue("check"));
    expect(configSchemas).toHaveBeenCalledWith("claude");
  });

  it("writes a mode change to that app's own plugin-updater config", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude" } });

    const select = await waitFor(() => getByLabelText("Automatic updates"));
    await fireEvent.change(select, { target: { value: "update" } });
    expect(configWrite).toHaveBeenCalledWith("claude", "plugin-updater", "auto_update_mode", "update");
  });

  it("writes a trigger toggle as the whole object, since it is one config key", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByRole } = render(AutoUpdateSettings, { props: { homeId: "claude" } });

    const toggle = await waitFor(() => getByRole("switch", { name: "Check when this app starts" }));
    await fireEvent.click(toggle);
    expect(configWrite).toHaveBeenCalledWith("claude", "plugin-updater", "auto_update_triggers", {
      loader: true, app: false, cairn: true,
    });
  });

  it("falls back to check when the home only has the older launch flag", async () => {
    configSchemas.mockResolvedValueOnce({
      ok: true as const,
      data: [{ plugin: "plugin-updater", defaults: {}, current: { update_on_launch: false } }],
    } as never);
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "opencode" } });

    await waitFor(() => expect(getByLabelText("Automatic updates")).toHaveValue("check"));
  });

  it("says so when the settings cannot be read", async () => {
    configSchemas.mockResolvedValueOnce({ ok: false as const, error: "no updater here" } as never);
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { findByText } = render(AutoUpdateSettings, { props: { homeId: "claude" } });

    expect(await findByText(/no updater here/)).toBeInTheDocument();
  });
});
