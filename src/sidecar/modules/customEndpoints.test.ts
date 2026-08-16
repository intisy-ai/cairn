import { describe, it, expect, vi } from "vitest";
import { customEndpointsList, endpointViews, customEndpointsUpsert, customEndpointsRemove, customEndpointsSaveKey, customEndpointsFormats } from "./customEndpoints.js";
import type { EndpointsApi } from "./customEndpoints.js";

// The provider plugin owns what an endpoint is and where it goes; this module only reaches it
// and passes calls through. So what is worth asserting is that it reaches the right plugin,
// forwards faithfully, and says something useful when the plugin is not installed.

const EP = { id: "local", label: "Local", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o"] };

function fakePlugin(overrides: Partial<EndpointsApi> = {}): { api: EndpointsApi; calls: string[] } {
  const calls: string[] = [];
  const api: EndpointsApi = {
    SUPPORTED_FORMATS: ["openai", "anthropic"],
    validateEndpoint: () => null,
    upsertEndpoint: (endpoint, repoDir) => { calls.push(`upsert:${endpoint.id}:${repoDir ?? ""}`); },
    removeEndpoint: (id, repoDir) => { calls.push(`remove:${id}:${repoDir ?? ""}`); },
    endpointViews: () => [{ ...EP, hasKey: true }],
    saveKey: (id, key) => { calls.push(`key:${id}:${key}`); },
    ...overrides,
  };
  return { api, calls };
}

const withPlugin = (api: EndpointsApi) => ({ dir: "/home", loadPlugin: async () => api });
const withoutPlugin = { dir: "/home", loadPlugin: async () => null };

describe("customEndpoints module", () => {
  it("lists what the plugin reports, including whether a key is set", async () => {
    const { api } = fakePlugin();
    const result = await endpointViews(withPlugin(api));
    expect(result).toEqual({ ok: true, data: [{ ...EP, hasKey: true }] });
  });

  // The formats come from the plugin that translates them, so the dashboard cannot offer one
  // the plugin could not serve.
  it("reports the formats the plugin says it supports", async () => {
    const { api } = fakePlugin();
    expect(await customEndpointsFormats(withPlugin(api))).toEqual({ ok: true, data: ["openai", "anthropic"] });
  });

  it("hands an upsert to the plugin along with the clone it should re-materialise", async () => {
    const { api, calls } = fakePlugin();
    expect((await customEndpointsUpsert(EP, withPlugin(api))).ok).toBe(true);
    expect(calls).toEqual([expect.stringMatching(/^upsert:local:.*custom-auth$/)]);
  });

  it("hands a removal to the plugin", async () => {
    const { api, calls } = fakePlugin();
    expect((await customEndpointsRemove("local", withPlugin(api))).ok).toBe(true);
    expect(calls).toEqual([expect.stringMatching(/^remove:local:.*custom-auth$/)]);
  });

  it("hands a key to the plugin", async () => {
    const { api, calls } = fakePlugin();
    expect((await customEndpointsSaveKey("local", "sk-secret", withPlugin(api))).ok).toBe(true);
    expect(calls).toEqual(["key:local:sk-secret"]);
  });

  it("refuses an empty endpoint id or key rather than passing them on", async () => {
    const { api, calls } = fakePlugin();
    expect(await customEndpointsSaveKey("", "sk", withPlugin(api))).toMatchObject({ ok: false });
    expect(await customEndpointsSaveKey("local", "", withPlugin(api))).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  // A refusal from the plugin is the answer, not something to translate or soften here.
  it("reports the plugin's own refusal", async () => {
    const { api } = fakePlugin({
      upsertEndpoint: () => { throw new Error("at least one model id is required"); },
    });
    expect(await customEndpointsUpsert(EP, withPlugin(api))).toEqual({ ok: false, error: "at least one model id is required" });
  });

  it("says the plugin is needed rather than pretending to manage endpoints without it", async () => {
    for (const call of [
      () => endpointViews(withoutPlugin),
      () => customEndpointsFormats(withoutPlugin),
      () => customEndpointsUpsert(EP, withoutPlugin),
      () => customEndpointsRemove("local", withoutPlugin),
      () => customEndpointsSaveKey("local", "sk", withoutPlugin),
    ]) {
      expect(await call()).toMatchObject({ ok: false, error: expect.stringContaining("plugin installed") });
    }
  });

  it("loads the plugin from the home it was told to work in", async () => {
    const loadPlugin = vi.fn(async () => fakePlugin().api);
    await endpointViews({ dir: "/somewhere/else", loadPlugin });
    expect(loadPlugin).toHaveBeenCalledOnce();
  });
});

describe("customEndpointsList", () => {
  it("reads the endpoints from the capability, not from the handler bundle", async () => {
    const result = await customEndpointsList({
      dir: "/home",
      appId: "cairn",
      capability: async () => ({ endpoints: async () => [{ id: "e1", label: "One", baseUrl: "https://one" }] }),
    });
    expect(result).toEqual({ ok: true, data: [{ id: "e1", label: "One", baseUrl: "https://one" }] });
  });

  it("answers an empty list when nothing provides the capability", async () => {
    const result = await customEndpointsList({ dir: "/home", appId: "cairn", capability: async () => null });
    expect(result).toEqual({ ok: true, data: [] });
  });

  // No capability dep here, so this exercises the real capabilityProviders lookup against a home
  // with no plugins deployed at all, distinct from the fixture above which merely stubs a null answer.
  it("answers an empty list, not a throw, when the home has no plugin host at all", async () => {
    const result = await customEndpointsList({ dir: "/no-such-home-for-custom-endpoints-test", appId: "some-other-app" });
    expect(result).toEqual({ ok: true, data: [] });
  });
});
