import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAccountsData, normalizeQuotas, buildSnapshot } from "./snapshot.js";

const ENV_KEYS = [
  "OPENCODE_DIR",
  "LOCALAPPDATA",
  "HUB_OPENCODE_DIR",
  "HUB_OPENCODE_DATA_DIR",
  "OPENCODE_CONFIG_DIR",
  "XDG_CONFIG_HOME",
  "HUB_CLAUDE_DIR",
  "CLAUDE_CONFIG_DIR",
  "HUB_CONFIG_DIR",
] as const;
const savedEnv: Record<string, string | undefined> = {};

let tempDir: string;

// buildSnapshot() pulls in session data from all three sources too, so every
// test pins the OpenCode/Claude Code homes to empty temp dirs by default (see
// sessions.test.ts for why), even though most tests here only care about the
// accounts side.
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "vendor-usage-snapshot-"));
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.HUB_OPENCODE_DIR = join(tempDir, "opencode-home");
  process.env.HUB_OPENCODE_DATA_DIR = join(tempDir, "opencode-data-home");
  process.env.HUB_CLAUDE_DIR = join(tempDir, "claude-home");
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function writeAccountsStore(configDir: string, store: unknown): void {
  const configFolder = join(configDir, "config");
  mkdirSync(configFolder, { recursive: true });
  writeFileSync(join(configFolder, "accounts.json"), JSON.stringify(store), "utf-8");
}

describe("normalizeQuotas", () => {
  it("normalizes the meta.cachedQuota per-pool shape (antigravity-style)", () => {
    const quotas = normalizeQuotas({
      meta: {
        cachedQuota: {
          "gemini-3-pro": { remainingFraction: 0.75, resetTime: "2026-01-01T00:00:00.000Z", modelCount: 3 },
        },
      },
    });
    expect(quotas["gemini-3-pro"].remaining).toBe(0.75);
    expect(quotas["gemini-3-pro"].modelCount).toBe(3);
    expect(quotas["gemini-3-pro"].resetTime).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  it("normalizes the cachedQuota.pools utilization shape (claude-code-style)", () => {
    const quotas = normalizeQuotas({
      cachedQuota: { pools: { "5-hour": { utilization: 0.4, reset: 12345 } } },
    });
    expect(quotas["5-hour"]).toEqual({ remaining: 0.6, resetTime: 12345 });
  });

  it("normalizes the legacy fiveHour/sevenDay shape", () => {
    const quotas = normalizeQuotas({
      cachedQuota: { fiveHour: { utilization: 0.25, reset: 999 }, sevenDay: { utilization: 0.1, reset: 888 } },
    });
    expect(quotas["5-hour"]).toEqual({ remaining: 0.75, resetTime: 999 });
    expect(quotas["7-day"]).toEqual({ remaining: 0.9, resetTime: 888 });
  });
});

describe("getAccountsData", () => {
  it("maps every account across every provider from the unified accounts store", () => {
    process.env.HUB_CONFIG_DIR = tempDir;
    const now = Date.now();
    writeAccountsStore(tempDir, {
      version: 1,
      providers: {
        antigravity: {
          accounts: [
            {
              id: "acc1",
              email: "user@example.com",
              enabled: true,
              lastUsed: now,
              rateLimitResetTimes: { pro: now + 60000 },
              meta: { cachedQuota: { pro: { remainingFraction: 0.5, resetTime: now + 60000 } } },
            },
          ],
        },
        stub: {
          accounts: [{ id: "acc2", enabled: false }],
        },
      },
    });

    const accounts = getAccountsData();
    expect(accounts).toHaveLength(2);

    const antigravityAccount = accounts.find((a) => a.provider === "antigravity");
    expect(antigravityAccount?.email).toBe("user@example.com");
    expect(antigravityAccount?.enabled).toBe(true);
    expect(antigravityAccount?.rateLimits.pro.isLimited).toBe(true);
    expect(antigravityAccount?.quotas.pro.remaining).toBe(0.5);

    const stubAccount = accounts.find((a) => a.provider === "stub");
    expect(stubAccount?.email).toBe("acc2");
    expect(stubAccount?.enabled).toBe(false);
  });

  it("returns an empty list when no accounts store exists", () => {
    process.env.HUB_CONFIG_DIR = tempDir;
    expect(getAccountsData()).toEqual([]);
  });
});

describe("buildSnapshot", () => {
  it("assembles accounts, sessions, models, and costByDay into one snapshot", () => {
    process.env.HUB_CONFIG_DIR = tempDir;
    process.env.HUB_CLAUDE_DIR = tempDir;
    writeAccountsStore(tempDir, {
      version: 1,
      providers: { antigravity: { accounts: [{ id: "acc1", email: "a@example.com", enabled: true }] } },
    });

    const projectDir = join(tempDir, "projects", "-proj");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, "sess1.jsonl"),
      JSON.stringify({
        type: "assistant",
        timestamp: "2026-02-02T00:00:00.000Z",
        message: { model: "claude-sonnet-5", usage: { input_tokens: 100, output_tokens: 20 } },
      }),
      "utf-8",
    );

    const snapshot = buildSnapshot();
    expect(typeof snapshot.updatedAt).toBe("number");
    expect(snapshot.accounts).toHaveLength(1);
    expect(snapshot.sessions).toHaveLength(1);
    expect(snapshot.sessions[0].source).toBe("claude-code");
    expect(Object.keys(snapshot.models)).toEqual(["claude-sonnet-5"]);
    expect(snapshot.costByDay["2026-02-02"]).toEqual({
      tokens: 120,
      tokensInput: 100,
      tokensOutput: 20,
      tokensReasoning: 0,
      messageCount: 1,
    });
  });

  it("returns an empty-but-well-shaped snapshot when no sources are present", () => {
    process.env.HUB_CONFIG_DIR = tempDir;
    process.env.HUB_CLAUDE_DIR = tempDir;
    const snapshot = buildSnapshot();
    expect(snapshot.accounts).toEqual([]);
    expect(snapshot.sessions).toEqual([]);
    expect(snapshot.models).toEqual({});
    expect(snapshot.costByDay).toEqual({});
  });
});
