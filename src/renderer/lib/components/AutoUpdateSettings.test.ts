// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";

const configWrite = vi.fn(async () => ({ ok: true as const, data: undefined }));

vi.mock("../ipc.js", () => ({
  cairn: {
    get configWrite() { return configWrite; },
  },
}));

beforeEach(() => {
  configWrite.mockClear();
});

const SCHEMA = {
  plugin: "plugin-updater",
  defaults: { auto_update_mode: "update", auto_update_triggers: { loader: true, app: true, cairn: true } },
  current: { auto_update_mode: "check", auto_update_triggers: { loader: true, app: true, cairn: true } },
};

describe("AutoUpdateSettings", () => {
  it("shows the mode this app home has on disk", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude", schema: SCHEMA } });

    expect(getByLabelText("Automatic updates")).toHaveValue("check");
  });

  it("writes a mode change to that app's own plugin-updater config", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude", schema: SCHEMA } });

    const select = getByLabelText("Automatic updates");
    await fireEvent.change(select, { target: { value: "update" } });
    expect(configWrite).toHaveBeenCalledWith("claude", "plugin-updater", "auto_update_mode", "update");
  });

  it("writes a trigger toggle as the whole object, since it is one config key", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByRole } = render(AutoUpdateSettings, { props: { homeId: "claude", schema: SCHEMA } });

    const toggle = getByRole("switch", { name: "Check when this app starts" });
    await fireEvent.click(toggle);
    expect(configWrite).toHaveBeenCalledWith("claude", "plugin-updater", "auto_update_triggers", {
      loader: true, app: false, cairn: true,
    });
  });

  it("falls back to check when the home only has the older launch flag", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, {
      props: { homeId: "opencode", schema: { plugin: "plugin-updater", defaults: {}, current: { update_on_launch: false } } },
    });

    expect(getByLabelText("Automatic updates")).toHaveValue("check");
  });

  it("renders the declared defaults while the home has no stored settings yet", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude", schema: null } });

    expect(getByLabelText("Automatic updates")).toHaveValue("update");
  });

  it("reflects a mode change immediately, before the write comes back", async () => {
    const AutoUpdateSettings = (await import("./AutoUpdateSettings.svelte")).default;
    const { getByLabelText } = render(AutoUpdateSettings, { props: { homeId: "claude", schema: SCHEMA } });

    await fireEvent.change(getByLabelText("Automatic updates"), { target: { value: "off" } });
    expect(getByLabelText("Automatic updates")).toHaveValue("off");
  });
});
