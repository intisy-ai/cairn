import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { downloads, enqueue, track, toggleDownloads, closeDownloads, clearFinished, setStep, resetDownloadsForTest } from "./downloads.js";

describe("downloads", () => {
  beforeEach(() => {
    resetDownloadsForTest();
  });

  it("starts the first task installing and opens the panel", () => {
    void track("Installing foo", "Claude Code", () => new Promise(() => {}));
    const state = get(downloads);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ label: "Installing foo", home: "Claude Code", status: "installing", error: "", source: null });
    expect(state.open).toBe(true);
  });

  it("runs one at a time: the second task waits as pending", () => {
    void track("first", "/h", () => new Promise(() => {}));
    void track("second", "/h", () => new Promise(() => {}));
    const tasks = get(downloads).tasks;
    expect(tasks.map((t) => t.status)).toEqual(["installing", "pending"]);
  });

  it("carries the source through to the task", () => {
    void enqueue({ label: "engine", home: "cairn", source: "cairn", run: () => new Promise(() => {}) });
    expect(get(downloads).tasks[0].source).toBe("cairn");
  });

  it("setStep updates the live step of an in-flight task", () => {
    void track("first", "/h", () => new Promise(() => {}));
    const id = get(downloads).tasks[0].id;
    setStep(id, "Downloading and building");
    expect(get(downloads).tasks[0].step).toBe("Downloading and building");
  });

  it("setStep leaves a finished task's step untouched", async () => {
    await track("done-task", "/h", async () => ({ ok: true, data: undefined }));
    const id = get(downloads).tasks[0].id;
    setStep(id, "late step");
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

  it("clearFinished drops done/failed tasks but keeps in-flight ones", async () => {
    await track("finished", "/home", async () => ({ ok: true, data: undefined }));
    void track("still running", "/home", () => new Promise(() => {}));
    clearFinished();
    const tasks = get(downloads).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].label).toBe("still running");
  });
});
