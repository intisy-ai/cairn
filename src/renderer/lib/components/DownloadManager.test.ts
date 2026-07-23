// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { downloads } from "../downloads.js";
import DownloadManager from "./DownloadManager.svelte";

describe("DownloadManager", () => {
  beforeEach(() => {
    downloads.set({ tasks: [], open: false });
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
});
