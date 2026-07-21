// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { stubIntisy } from "../testing.js";
import AppsPlugins from "./AppsPlugins.svelte";

const PLUGINS = [
  {
    name: "stub-plugin",
    kind: "git" as const,
    enabled: true,
    installedVersion: "1.2.0",
    updateAvailable: true,
  },
];

describe("AppsPlugins screen", () => {
  it("shows the opencode install affordance, the plugin update badge, and toggles enable", async () => {
    const appsInstallCli = vi.fn(async () => ({ ok: true, data: { stdout: "", stderr: "" } }) as const);
    const pluginsSetEnabled = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubIntisy({
      appsDetect: async () => ({ ok: true, data: { claude: true, opencode: false } }),
      pluginsList: async () => ({ ok: true, data: PLUGINS }),
      appsInstallCli,
      pluginsSetEnabled,
    });

    const { getByText, getByRole } = render(AppsPlugins);

    await waitFor(() => expect(getByText("OpenCode")).toBeTruthy());
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("Installed")).toBeTruthy();
    expect(getByText("Not installed")).toBeTruthy();

    await fireEvent.click(getByText("Install"));
    expect(appsInstallCli).toHaveBeenCalledWith("opencode");

    await waitFor(() => expect(getByText("stub-plugin")).toBeTruthy());
    expect(getByText("Update available")).toBeTruthy();

    const pluginSwitch = getByRole("switch", { name: /stub-plugin enabled/i });
    await fireEvent.click(pluginSwitch);
    expect(pluginsSetEnabled).toHaveBeenCalledWith("stub-plugin", false);
  });

  it("shows an inline error when appsDetect fails", async () => {
    stubIntisy({ appsDetect: async () => ({ ok: false, error: "detect boom" }) });
    const { getByText } = render(AppsPlugins);
    await waitFor(() => expect(getByText(/detect boom/i)).toBeTruthy());
  });

  it("shows an inline error when pluginsList fails", async () => {
    stubIntisy({ pluginsList: async () => ({ ok: false, error: "list boom" }) });
    const { getByText } = render(AppsPlugins);
    await waitFor(() => expect(getByText(/list boom/i)).toBeTruthy());
  });
});
