import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { downloads, rows, activeByPlugin, activeByPluginHome, enqueue, track, toggleDownloads, closeDownloads, clearFinished, setStep, resetDownloadsForTest, seedJobsForTest, jobKey } from "./downloads.js";
import type { Job } from "@cairn/shared";

vi.mock("./ipc.js", () => ({
  cairn: {
    jobsCancel: async () => ({ ok: true, data: true }),
    jobsClearFinished: async () => ({ ok: true, data: undefined }),
    jobsList: async () => ({ ok: true, data: [] }),
    jobsEnqueue: async () => ({ ok: false, error: "not wired in tests" }),
  },
}));

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1", kind: "install", plugin: "plugin-x", url: "u", home: "claude",
    status: "running", phase: "", percent: -1, phases: [], samples: [], queuedAt: 0, ...overrides,
  };
}

describe("downloads", () => {
  beforeEach(() => {
    resetDownloadsForTest();
  });

  it("shows a tracked operation immediately and opens the panel", () => {
    void track("Installing foo", "Claude Code", () => new Promise(() => {}));
    const state = get(downloads);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ label: "Installing foo", home: "Claude Code", status: "installing", error: "" });
    expect(state.open).toBe(true);
  });

  // Serializing work is the sidecar queue's job; a local operation is not a plugin build.
  it("runs tracked operations without queueing them behind each other", () => {
    void track("first", "/h", () => new Promise(() => {}));
    void track("second", "/h", () => new Promise(() => {}));
    expect(get(downloads).tasks.map((t) => t.status)).toEqual(["installing", "installing"]);
  });

  it("mirrors sidecar jobs as rows, labelled by what they do", () => {
    seedJobsForTest([job({ kind: "update", plugin: "wakatime-sync", home: "opencode" })]);
    expect(get(rows)[0]).toMatchObject({ label: "Update wakatime-sync", home: "Opencode", status: "installing", cancellable: true });
  });

  it("indexes live jobs by plugin and by plugin+home, and drops finished ones", () => {
    seedJobsForTest([
      job({ id: "a", plugin: "plugin-x", home: "claude", status: "running" }),
      job({ id: "b", plugin: "plugin-x", home: "opencode", status: "queued" }),
      job({ id: "c", plugin: "plugin-y", home: "claude", status: "done" }),
    ]);
    expect(get(activeByPlugin)["plugin-x"]).toBeTruthy();
    expect(get(activeByPlugin)["plugin-y"]).toBeUndefined();
    expect(get(activeByPluginHome)[jobKey("plugin-x", "claude")]?.status).toBe("installing");
    expect(get(activeByPluginHome)[jobKey("plugin-x", "opencode")]?.status).toBe("pending");
    expect(get(activeByPluginHome)[jobKey("plugin-y", "claude")]).toBeUndefined();
  });

  it("marks a cancelling job as such and stops offering to cancel it again", () => {
    seedJobsForTest([job({ status: "cancelling" })]);
    expect(get(rows)[0]).toMatchObject({ status: "cancelling", cancellable: false });
  });

  // setStep is keyed by the id handed to run(), which is the pushed progress event's id.
  it("setStep records the step and percent while in flight", () => {
    let taskId = 0;
    void enqueue({ label: "first", home: "/h", run: (id) => { taskId = id; return new Promise(() => {}); } });
    setStep(taskId, "Downloading and building", 40);
    expect(get(downloads).tasks[0]).toMatchObject({ step: "Downloading and building", percent: 40 });
  });

  it("setStep leaves a finished task's step untouched", async () => {
    let taskId = 0;
    await enqueue({ label: "done-task", home: "/h", run: async (id) => { taskId = id; return { ok: true as const, data: undefined }; } });
    setStep(taskId, "late step");
    expect(get(downloads).tasks[0].step).toBe("");
  });

  it("marks a task failed with the Result error on an ok:false result", async () => {
    const result = await track("Installing bar", "/home", async () => ({ ok: false, error: "boom" }));
    expect(result).toEqual({ ok: false, error: "boom" });
    const task = get(downloads).tasks[0];
    expect(task.status).toBe("failed");
    expect(task.error).toBe("boom");
  });

  it("marks a task done on a resolved ok result", async () => {
    const result = await track("Installing baz", "/home", async () => ({ ok: true, data: 42 }));
    expect(result).toEqual({ ok: true, data: 42 });
    const task = get(downloads).tasks[0];
    expect(task.status).toBe("done");
    expect(task.error).toBe("");
  });

  it("marks a task failed via summarizeFailure even when the Result is ok", async () => {
    await enqueue({
      label: "partial",
      home: "/h",
      run: async () => ({ ok: true as const, data: { bad: true } }),
      summarizeFailure: (data) => (data.bad ? "one home failed" : null),
    });
    const task = get(downloads).tasks[0];
    expect(task.status).toBe("failed");
    expect(task.error).toBe("one home failed");
  });

  it("marks a task failed when run throws", async () => {
    const result = await track("Installing qux", "/home", async () => {
      throw new Error("nope");
    });
    expect(result).toEqual({ ok: false, error: "nope" });
    expect(get(downloads).tasks[0].status).toBe("failed");
  });

  it("toggleDownloads flips the open flag", () => {
    expect(get(downloads).open).toBe(false);
    toggleDownloads();
    expect(get(downloads).open).toBe(true);
    toggleDownloads();
    expect(get(downloads).open).toBe(false);
  });

  it("closeDownloads always closes the panel", () => {
    toggleDownloads();
    expect(get(downloads).open).toBe(true);
    closeDownloads();
    expect(get(downloads).open).toBe(false);
    closeDownloads();
    expect(get(downloads).open).toBe(false);
  });

  it("clearFinished drops finished work of both kinds but keeps what is live", async () => {
    await track("finished", "/home", async () => ({ ok: true, data: undefined }));
    void track("still running", "/home", () => new Promise(() => {}));
    seedJobsForTest([job({ id: "old", status: "done" }), job({ id: "live", plugin: "p2", status: "running" })]);
    clearFinished();
    const labels = get(downloads).tasks.map((t) => t.label);
    expect(labels).toContain("still running");
    expect(labels).toContain("Install p2");
    expect(labels).not.toContain("finished");
    expect(labels).not.toContain("Install plugin-x");
  });
});
