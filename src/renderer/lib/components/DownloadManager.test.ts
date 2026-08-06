// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { seedTasksForTest, seedJobsForTest, openPanelForTest, resetDownloadsForTest, type DownloadRow } from "../downloads.js";
import type { Job } from "@cairn/shared";

const cancelled: string[] = [];
vi.mock("../ipc.js", () => ({
  cairn: {
    jobsCancel: async (id: string) => { cancelled.push(id); return { ok: true, data: true }; },
    jobsClearFinished: async () => ({ ok: true, data: undefined }),
    jobsList: async () => ({ ok: true, data: [] }),
  },
}));

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1", kind: "install", plugin: "plugin-x", url: "u", home: "claude",
    status: "running", phase: "", percent: -1, phases: [], queuedAt: 0, ...overrides,
  };
}
import DownloadManager from "./DownloadManager.svelte";

type SeedTask = { id?: number; label?: string; home?: string; status?: DownloadRow["status"]; step?: string; percent?: number; error?: string; queuedAt?: number };

function task(overrides: SeedTask = {}): SeedTask {
  return { id: 1, label: "a", home: "/h", status: "installing", step: "", percent: -1, error: "", queuedAt: 0, ...overrides };
}

function seed(tasks: SeedTask[], open = false): void {
  seedTasksForTest(tasks);
  if (open) openPanelForTest();
}

describe("DownloadManager", () => {
  beforeEach(() => {
    resetDownloadsForTest();
    cancelled.length = 0;
  });

  it("hides the button when no tasks exist", () => {
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
  });

  it("shows the button when at least one task exists", () => {
    seed([task({ status: "done" })], false);
    const { getByRole } = render(DownloadManager);
    expect(getByRole("button", { name: "Toggle download manager" })).toBeTruthy();
  });

  it("badges the count of in-flight (pending + installing) tasks", () => {
    seed([
        task({ id: 1, status: "installing" }),
        task({ id: 2, status: "pending" }),
        task({ id: 3, status: "done" }),
      ], false);
    const { getByText } = render(DownloadManager);
    expect(getByText("2")).toBeTruthy();
  });

  it("hides the badge when no task is in flight", () => {
    seed([task({ status: "done" })], false);
    const { container } = render(DownloadManager);
    expect(container.querySelector(".badge")).toBeNull();
  });

  it("toggles the panel open and lists label, home, and progress line", async () => {
    seed([task({ label: "installing plugin-x", home: "Claude Code", status: "installing" })], false);
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(queryByText("installing plugin-x")).toBeNull();

    await fireEvent.click(getByRole("button"));

    expect(getByText("installing plugin-x")).toBeTruthy();
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("Working…")).toBeTruthy();
  });

  it("shows the live step text while installing", () => {
    seed([task({ status: "installing", step: "building… (3/4)" })], true);
    const { getByText } = render(DownloadManager);
    expect(getByText("building… (3/4)")).toBeTruthy();
  });

  it("appends the percent to the step when known", () => {
    seed([task({ status: "installing", step: "Downloading and building", percent: 40 })], true);
    const { getByText } = render(DownloadManager);
    expect(getByText("Downloading and building · 40%")).toBeTruthy();
  });

  it("renders the aggregate progress ring while work is in flight", () => {
    seed([task({ status: "installing", percent: 50 })], false);
    const { container } = render(DownloadManager);
    expect(container.querySelector(".ringfill")).toBeTruthy();
  });

  it("shows Queued for a pending task", () => {
    seed([task({ status: "pending" })], true);
    const { getByText } = render(DownloadManager);
    expect(getByText("Queued")).toBeTruthy();
  });

  // Who performed a download stopped being a distinction worth a badge once every plugin
  // install became one kind of sidecar job. Cancelling is what a row needs to offer instead.
  it("offers Cancel for a job that can still be cancelled, and not for a finished one", () => {
    seedJobsForTest([
      job({ id: "j1", status: "running" }),
      job({ id: "j2", plugin: "other", status: "done" }),
    ]);
    openPanelForTest();
    const { getAllByText } = render(DownloadManager);
    expect(getAllByText("Cancel")).toHaveLength(1);
  });

  it("cancels the job behind the row it was clicked on", async () => {
    seedJobsForTest([job({ id: "j9", status: "running" })]);
    openPanelForTest();
    const { getByText } = render(DownloadManager);
    await fireEvent.click(getByText("Cancel"));
    expect(cancelled).toEqual(["j9"]);
  });

  it("shows the error text for a failed task", () => {
    seed([task({ status: "failed", error: "network error" })], true);
    const { getByText } = render(DownloadManager);
    expect(getByText("network error")).toBeTruthy();
  });

  it("hides the Clear button when no task is finished", () => {
    seed([task({ status: "installing" })], true);
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("clicking Clear removes finished tasks but keeps in-flight ones", async () => {
    seed([task({ id: 1, label: "plugin-a", status: "done" }), task({ id: 2, label: "plugin-b", status: "installing" })], true);
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(getByText("plugin-a")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByText("plugin-a")).toBeNull();
    expect(getByText("plugin-b")).toBeTruthy();
  });

  it("hides the panel and button after Clear empties all tasks", async () => {
    seed([task({ label: "plugin-final", status: "done" })], true);
    const { getByRole, queryByRole, queryByText, container } = render(DownloadManager);
    expect(getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(queryByText("plugin-final")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
    expect(container.querySelector(".panel")).toBeNull();
  });
});
