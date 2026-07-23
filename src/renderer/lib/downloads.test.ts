import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { downloads, track, toggleDownloads, clearFinished } from "./downloads.js";

describe("downloads", () => {
  beforeEach(() => {
    downloads.set({ tasks: [], open: false });
  });

  it("appends a running task and opens the panel", () => {
    void track("Installing foo", "/home/claude", () => new Promise(() => {}));
    const state = get(downloads);
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]).toMatchObject({ label: "Installing foo", home: "/home/claude", status: "running", error: "" });
    expect(state.open).toBe(true);
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

  it("clearFinished drops non-running tasks", async () => {
    await track("finished", "/home", async () => ({ ok: true, data: undefined }));
    void track("still running", "/home", () => new Promise(() => {}));
    clearFinished();
    const tasks = get(downloads).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].label).toBe("still running");
  });
});
