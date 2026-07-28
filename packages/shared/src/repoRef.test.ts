import { describe, it, expect } from "vitest";
import { parseRepoRef, classifyRepoName } from "./repoRef.js";

describe("parseRepoRef", () => {
  it("parses a full github url", () => {
    expect(parseRepoRef("https://github.com/intisy-ai/claude-code-auth")).toEqual({
      owner: "intisy-ai",
      repo: "claude-code-auth",
      url: "https://github.com/intisy-ai/claude-code-auth",
    });
  });
  it("parses an owner/repo short ref", () => {
    expect(parseRepoRef("intisy-ai/some-proxy")).toEqual({
      owner: "intisy-ai",
      repo: "some-proxy",
      url: "https://github.com/intisy-ai/some-proxy",
    });
  });
  it("strips a trailing .git and slash", () => {
    expect(parseRepoRef("https://github.com/o/r.git")?.repo).toBe("r");
    expect(parseRepoRef("https://github.com/o/r/")?.repo).toBe("r");
  });
  it("rejects malformed input", () => {
    expect(parseRepoRef("")).toBeNull();
    expect(parseRepoRef("   ")).toBeNull();
    expect(parseRepoRef("not-a-ref")).toBeNull();
    expect(parseRepoRef("https://gitlab.com/o/r")).toBeNull();
    expect(parseRepoRef("o/r/extra")).toBeNull();
  });
});

describe("classifyRepoName", () => {
  it("classifies by suffix", () => {
    expect(classifyRepoName("foo-proxy")).toBe("proxy");
    expect(classifyRepoName("foo-auth")).toBe("provider");
    expect(classifyRepoName("some-plugin")).toBe("plugin");
  });
  it("returns null for loaders and core libraries", () => {
    expect(classifyRepoName("claude-code-loader")).toBeNull();
    expect(classifyRepoName("core-proxy")).toBeNull();
  });
});
