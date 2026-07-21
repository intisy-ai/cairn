import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const stubHandlerPath = fileURLToPath(new URL("../../../../../providers/stub-auth/dist/handler.js", import.meta.url));

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

// buildSnapshot() reads sessions from the real OpenCode/Claude Code homes when
// not overridden, so every test pins all three homes to empty temp dirs to
// avoid asserting on this machine's real usage data (see vendor/usage tests).
beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "dash-usage-"));
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.HUB_CONFIG_DIR = join(tempDir, "config-home");
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

function seedStubProvider(): void {
  const configDir = process.env.HUB_CONFIG_DIR as string;
  const repoDir = join(configDir, "repos", "stub-auth");
  mkdirSync(join(repoDir, "dist"), { recursive: true });
  writeFileSync(
    join(repoDir, "package.json"),
    JSON.stringify({
      name: "stub-auth",
      claudeHub: { authProviders: [{ name: "stub", handler: "dist/handler.js" }] },
    }),
  );
  copyFileSync(stubHandlerPath, join(repoDir, "dist", "handler.js"));
}

function seedClaudeSession(): void {
  const claudeHome = process.env.HUB_CLAUDE_DIR as string;
  const projectDir = join(claudeHome, "projects", "-my-test-project");
  mkdirSync(projectDir, { recursive: true });
  const lines = [
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:00:00.000Z",
      message: {
        model: "claude-sonnet-5",
        usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
      },
    }),
    JSON.stringify({
      type: "assistant",
      timestamp: "2026-01-01T00:05:00.000Z",
      message: { model: "claude-sonnet-5", usage: { input_tokens: 10, output_tokens: 5 } },
    }),
  ];
  writeFileSync(join(projectDir, "session-abc.jsonl"), lines.join("\n"), "utf-8");
}

describe("usage sidecar module", () => {
  it("returns real sessions and models from the vendored snapshot layer alongside deployed-provider accounts", async () => {
    seedStubProvider();
    seedClaudeSession();
    const { addAccount } = await import("@core-auth/index.js");
    addAccount("stub", { id: "a1", email: "a1@example.com", refresh: "r1", enabled: true });

    const { usageSnapshot } = await import("./usage.js");
    const result = await usageSnapshot();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.data.accounts).toEqual([{ provider: "stub", id: "a1" }]);

    expect(result.data.sessions).toHaveLength(1);
    const session = result.data.sessions[0];
    expect(session.id).toBe("session-abc");
    expect(session.source).toBe("claude-code");
    expect(session.messageCount).toBe(2);
    expect(session.tokens).toEqual({ input: 1010, output: 205, reasoning: 0, cacheRead: 50, cacheWrite: 10 });
    expect(session.title).toBe("my test project");
    expect("cost" in session).toBe(false);

    expect(Object.keys(result.data.models)).toEqual(["claude-sonnet-5"]);
    expect(result.data.models["claude-sonnet-5"]).toEqual({
      provider: "anthropic",
      tokens: { input: 1010, output: 205, reasoning: 0 },
      sessionCount: 1,
      messageCount: 2,
    });

    expect(typeof result.data.updatedAt).toBe("string");
    expect(result.data.updatedAt.length).toBeGreaterThan(0);
  });

  it("returns ok:true with empty accounts/sessions/models when no sources are present", async () => {
    const { usageSnapshot } = await import("./usage.js");
    const result = await usageSnapshot();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.data.accounts).toEqual([]);
    expect(result.data.sessions).toEqual([]);
    expect(result.data.models).toEqual({});
  });
});
