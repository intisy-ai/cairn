import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { customEndpointsList, customEndpointsUpsert, customEndpointsRemove, customEndpointsSaveKey } from "./customEndpoints.js";

function home(): string {
  const d = mkdtempSync(join(tmpdir(), "custom-ep-"));
  mkdirSync(join(d, "config"), { recursive: true });
  return d;
}
function readEndpoints(dir: string): unknown[] {
  const f = join(dir, "config", "custom-auth.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")).endpoints : [];
}
const EP = { id: "local", label: "Local", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o"] };

describe("customEndpoints module", () => {
  it("upserts an endpoint into config/custom-auth.json", async () => {
    const dir = home();
    const r = await customEndpointsUpsert(EP, { dir });
    expect(r.ok).toBe(true);
    expect(readEndpoints(dir)).toEqual([EP]);
    // upsert by id replaces, not duplicates
    await customEndpointsUpsert({ ...EP, label: "Local 2" }, { dir });
    expect(readEndpoints(dir)).toEqual([{ ...EP, label: "Local 2" }]);
  });

  it("rejects invalid endpoints", async () => {
    const dir = home();
    expect((await customEndpointsUpsert({ ...EP, id: "bad/id" }, { dir })).ok).toBe(false);
    expect((await customEndpointsUpsert({ ...EP, baseUrl: "not-a-url" }, { dir })).ok).toBe(false);
    expect((await customEndpointsUpsert({ ...EP, format: "anthropic" }, { dir })).ok).toBe(false);
    expect((await customEndpointsUpsert({ ...EP, models: [] }, { dir })).ok).toBe(false);
  });

  it("saveKey stores via core-auth (key never in config) and list reports hasKey", async () => {
    const dir = home();
    await customEndpointsUpsert(EP, { dir });
    const added: Array<{ p: string; a: { refresh: string; meta?: { endpointId?: string } } }> = [];
    const accounts: Array<{ enabled?: boolean; meta?: { endpointId?: string } }> = [];
    const addAccount = (p: string, a: { refresh: string; meta?: { endpointId?: string } }) => { added.push({ p, a }); accounts.push({ enabled: true, meta: a.meta }); };
    const listAccounts = () => accounts;

    const r = await customEndpointsSaveKey("local", "sk-secret", { dir, addAccount });
    expect(r.ok).toBe(true);
    expect(added[0]).toMatchObject({ p: "custom", a: { refresh: "sk-secret", meta: { endpointId: "local" } } });
    const cfgText = readFileSync(join(dir, "config", "custom-auth.json"), "utf8");
    expect(cfgText).not.toContain("sk-secret");

    const list = await customEndpointsList({ dir, listAccounts });
    expect(list.ok && list.data[0]).toMatchObject({ id: "local", hasKey: true });
  });

  it("saveKey rejects an unknown endpoint", async () => {
    const dir = home();
    expect((await customEndpointsSaveKey("nope", "sk", { dir, addAccount: () => {} })).ok).toBe(false);
  });

  it("remove deletes the endpoint and its key account", async () => {
    const dir = home();
    await customEndpointsUpsert(EP, { dir });
    const removed: Array<{ p: string; id: string }> = [];
    const r = await customEndpointsRemove("local", { dir, removeAccount: (p, id) => removed.push({ p, id }) });
    expect(r.ok).toBe(true);
    expect(readEndpoints(dir)).toEqual([]);
    expect(removed[0]).toEqual({ p: "custom", id: "local" });
  });
});
