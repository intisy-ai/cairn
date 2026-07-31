// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { downloads, type DownloadTask } from "../downloads.js";
import DownloadManager from "./DownloadManager.svelte";

function task(overrides: Partial<DownloadTask> = {}): DownloadTask {
  return { id: 1, label: "a", home: "/h", source: null, status: "installing", step: "", error: "", queuedAt: 0, ...overrides };
}

describe("DownloadManager", () => {
  beforeEach(() => {
    downloads.set({ tasks: [], open: false });
  });

  it("hides the button when no tasks exist", () => {
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
  });

  it("shows the button when at least one task exists", () => {
    downloads.set({ tasks: [task({ status: "done" })], open: false });
    const { getByRole } = render(DownloadManager);
    expect(getByRole("button", { name: "Toggle download manager" })).toBeTruthy();
  });

  it("badges the count of in-flight (pending + installing) tasks", () => {
    downloads.set({
      tasks: [
        task({ id: 1, status: "installing" }),
        task({ id: 2, status: "pending" }),
        task({ id: 3, status: "done" }),
      ],
      open: false,
    });
    const { getByText } = render(DownloadManager);
    expect(getByText("2")).toBeTruthy();
  });

  it("hides the badge when no task is in flight", () => {
    downloads.set({ tasks: [task({ status: "done" })], open: false });
    const { container } = render(DownloadManager);
    expect(container.querySelector(".badge")).toBeNull();
  });

  it("toggles the panel open and lists label, home, and progress line", async () => {
    downloads.set({ tasks: [task({ label: "installing plugin-x", home: "Claude Code", status: "installing" })], open: false });
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(queryByText("installing plugin-x")).toBeNull();

    await fireEvent.click(getByRole("button"));

    expect(getByText("installing plugin-x")).toBeTruthy();
    expect(getByText("Claude Code")).toBeTruthy();
    expect(getByText("Installing…")).toBeTruthy();
  });

  it("shows the live step text while installing", () => {
    downloads.set({ tasks: [task({ status: "installing", step: "building… (3/4)" })], open: true });
    const { getByText } = render(DownloadManager);
    expect(getByText("building… (3/4)")).toBeTruthy();
  });

  it("shows Queued for a pending task", () => {
    downloads.set({ tasks: [task({ status: "pending" })], open: true });
    const { getByText } = render(DownloadManager);
    expect(getByText("Queued")).toBeTruthy();
  });

  it("shows the source chip for cairn-direct and plugin-updater downloads", () => {
    downloads.set({
      tasks: [task({ id: 1, source: "cairn" }), task({ id: 2, source: "plugin-updater" })],
      open: true,
    });
    const { getByText } = render(DownloadManager);
    expect(getByText("Cairn direct")).toBeTruthy();
    expect(getByText("plugin-updater")).toBeTruthy();
  });

  it("shows the error text for a failed task", () => {
    downloads.set({ tasks: [task({ status: "failed", error: "network error" })], open: true });
    const { getByText } = render(DownloadManager);
    expect(getByText("network error")).toBeTruthy();
  });

  it("hides the Clear button when no task is finished", () => {
    downloads.set({ tasks: [task({ status: "installing" })], open: true });
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("clicking Clear removes finished tasks but keeps in-flight ones", async () => {
    downloads.set({
      tasks: [task({ id: 1, label: "plugin-a", status: "done" }), task({ id: 2, label: "plugin-b", status: "installing" })],
      open: true,
    });
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(getByText("plugin-a")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByText("plugin-a")).toBeNull();
    expect(getByText("plugin-b")).toBeTruthy();
  });

  it("hides the panel and button after Clear empties all tasks", async () => {
    downloads.set({ tasks: [task({ label: "plugin-final", status: "done" })], open: true });
    const { getByRole, queryByRole, queryByText, container } = render(DownloadManager);
    expect(getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(queryByText("plugin-final")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
    expect(container.querySelector(".panel")).toBeNull();
  });
});
