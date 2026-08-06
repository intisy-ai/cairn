// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/svelte";
import type { Job, ActivityRecord } from "@cairn/shared";
import { resetDownloadsForTest, seedJobsForTest } from "../downloads.js";

const cancelled: string[] = [];
let historyRecords: ActivityRecord[] = [];

vi.mock("../ipc.js", () => ({
  cairn: {
    jobsCancel: async (id: string) => { cancelled.push(id); return { ok: true, data: true }; },
    jobsClearFinished: async () => ({ ok: true, data: undefined }),
    jobsList: async () => ({ ok: true, data: [] }),
    activityRead: async () => ({ ok: true, data: { records: historyRecords } }),
  },
}));

const { default: Downloads } = await import("./Downloads.svelte");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "j1", kind: "install", plugin: "plugin-x", url: "u", home: "claude",
    status: "running", phase: "building", percent: 40, phases: [{ name: "downloading", ms: 3700 }],
    queuedAt: 0, startedAt: 0, ...overrides,
  };
}

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    id: "r1", ts: Date.now(), home: "/h", topic: "plugin.installed", action: "installed",
    actor: "system", impact: "notice", source: "plugin-updater",
    subject: { kind: "plugin", id: "config-ledger", label: "config-ledger" },
    details: { version: "f30d8a72ecd" }, text: "Installed config-ledger",
    origin: { app: "claude", home: "/h" }, cause: { kind: "user" }, trace: { id: "t" },
    outcome: "ok", durationMs: 14000, ...overrides,
  } as ActivityRecord;
}

describe("Downloads screen", () => {
  beforeEach(() => {
    resetDownloadsForTest();
    cancelled.length = 0;
    historyRecords = [];
  });

  it("says so plainly when nothing has been downloaded", async () => {
    render(Downloads);
    expect(await screen.findByText(/Nothing has been downloaded yet/)).toBeTruthy();
  });

  it("shows the active job with its phase trail and elapsed time", () => {
    seedJobsForTest([job()]);
    const { container, getByText } = render(Downloads);
    expect(container.querySelector("[data-testid='active-job']")).toBeTruthy();
    expect(getByText("Install plugin-x")).toBeTruthy();
    // A finished phase carries the time it really took, not a guess.
    expect(getByText(/downloading 3\.7s/)).toBeTruthy();
    expect(getByText(/building/)).toBeTruthy();
  });

  it("lists queued jobs separately, with a count and a cancel each", () => {
    seedJobsForTest([
      job({ id: "a", status: "running" }),
      job({ id: "b", plugin: "second", status: "queued" }),
      job({ id: "c", plugin: "third", status: "queued" }),
    ]);
    const { container, getByText } = render(Downloads);
    expect(getByText("Queued (2)")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid='queued-job']")).toHaveLength(2);
  });

  it("cancels the job a Cancel button belongs to", async () => {
    seedJobsForTest([job({ id: "j7", status: "running" })]);
    const { getByText } = render(Downloads);
    await fireEvent.click(getByText("Cancel"));
    expect(cancelled).toEqual(["j7"]);
  });

  it("reports a cancelling job without offering to cancel it again", () => {
    seedJobsForTest([job({ status: "cancelling" })]);
    const { getByText, queryByText } = render(Downloads);
    expect(getByText("Cancelling…")).toBeTruthy();
    expect(queryByText("Cancel")).toBeNull();
  });

  it("shows finished jobs and the activity log's history together", async () => {
    seedJobsForTest([job({ id: "old", plugin: "failed-one", status: "failed", error: "disk full", endedAt: 1000 })]);
    historyRecords = [record()];
    const { container } = render(Downloads);
    expect(container.querySelector("[data-testid='recent-row']")).toBeTruthy();
    expect(await screen.findByText("config-ledger")).toBeTruthy();
    expect(await screen.findByText("disk full")).toBeTruthy();
  });

  it("shows an update's version change from the history record", async () => {
    historyRecords = [record({ action: "updated", details: { fromVersion: "0bd46a3cd6c1", toVersion: "5ff48beff275" } })];
    render(Downloads);
    expect(await screen.findByText("0bd46a3c → 5ff48bef")).toBeTruthy();
  });

  it("leaves out a record that names no plugin, like an updates-available notice", async () => {
    historyRecords = [
      record({ id: "notice", action: "updates_available", subject: undefined, details: { count: 1, names: ["x"] } }),
      record({ id: "real" }),
    ];
    const { container } = render(Downloads);
    await screen.findByText("config-ledger");
    expect(container.querySelectorAll("[data-testid='history-row']")).toHaveLength(1);
  });
});
