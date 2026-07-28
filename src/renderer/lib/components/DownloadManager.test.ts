// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { downloads } from "../downloads.js";
import DownloadManager from "./DownloadManager.svelte";

describe("DownloadManager", () => {
  beforeEach(() => {
    downloads.set({ tasks: [], open: false });
  });

  it("hides the button when no tasks exist", () => {
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
  });

  it("shows the button when at least one task exists", () => {
    downloads.set({
      tasks: [{ id: 1, label: "a", home: "/h", status: "done", error: "", startedAt: 0 }],
      open: false,
    });
    const { getByRole } = render(DownloadManager);
    expect(getByRole("button", { name: "Toggle download manager" })).toBeTruthy();
  });

  it("shows a badge equal to the running task count", () => {
    downloads.set({
      tasks: [
        { id: 1, label: "a", home: "/h", status: "running", error: "", startedAt: 0 },
        { id: 2, label: "b", home: "/h", status: "running", error: "", startedAt: 0 },
        { id: 3, label: "c", home: "/h", status: "done", error: "", startedAt: 0 },
      ],
      open: false,
    });
    const { getByText } = render(DownloadManager);
    expect(getByText("2")).toBeTruthy();
  });

  it("hides the badge when no task is running", () => {
    const { container } = render(DownloadManager);
    expect(container.querySelector(".badge")).toBeNull();
  });

  it("toggles the panel open on click and lists task label, home, and status", async () => {
    downloads.set({
      tasks: [{ id: 1, label: "installing plugin-x", home: "/home/claude", status: "running", error: "", startedAt: 0 }],
      open: false,
    });
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(queryByText("installing plugin-x")).toBeNull();

    await fireEvent.click(getByRole("button"));

    expect(getByText("installing plugin-x")).toBeTruthy();
    expect(getByText("/home/claude")).toBeTruthy();
    expect(getByText("running")).toBeTruthy();
  });

  it("shows the error text for a failed task", () => {
    downloads.set({
      tasks: [{ id: 1, label: "installing plugin-y", home: "/home/claude", status: "failed", error: "network error", startedAt: 0 }],
      open: true,
    });
    const { getByText } = render(DownloadManager);
    expect(getByText("network error")).toBeTruthy();
  });

  it("hides the Clear button when no task is finished", () => {
    downloads.set({
      tasks: [{ id: 1, label: "installing plugin-z", home: "/h", status: "running", error: "", startedAt: 0 }],
      open: true,
    });
    const { queryByRole } = render(DownloadManager);
    expect(queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("clicking Clear removes finished tasks but keeps running ones", async () => {
    downloads.set({
      tasks: [
        { id: 1, label: "installing plugin-a", home: "/h", status: "done", error: "", startedAt: 0 },
        { id: 2, label: "installing plugin-b", home: "/h", status: "running", error: "", startedAt: 0 },
      ],
      open: true,
    });
    const { getByRole, getByText, queryByText } = render(DownloadManager);
    expect(getByText("installing plugin-a")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByText("installing plugin-a")).toBeNull();
    expect(getByText("installing plugin-b")).toBeTruthy();
  });

  it("hides the panel and button after Clear empties all tasks", async () => {
    downloads.set({
      tasks: [{ id: 1, label: "installing plugin-final", home: "/h", status: "done", error: "", startedAt: 0 }],
      open: true,
    });
    const { getByRole, queryByRole, queryByText, container } = render(DownloadManager);
    expect(getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(queryByText("installing plugin-final")).toBeTruthy();

    await fireEvent.click(getByRole("button", { name: "Clear" }));

    expect(queryByRole("button", { name: "Toggle download manager" })).toBeNull();
    expect(container.querySelector(".panel")).toBeNull();
  });
});
