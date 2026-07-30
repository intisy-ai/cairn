// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import type { ConfigHomeView } from "@cairn/shared";
import Config from "./Config.svelte";

function homeView(over: Partial<ConfigHomeView> = {}): ConfigHomeView {
  return {
    homeId: "claude",
    label: "Claude Code",
    present: true,
    snapshots: [{ hash: "abc1234def", date: "2026-07-30", subject: "auto: manual snapshot" }],
    pending: [{ file: "settings.json", key: "theme", old: "light", new: "dark" }],
    profiles: { list: ["main", "work"], current: "main" },
    ...over,
  };
}

describe("Config screen", () => {
  it("renders each home's pending changes and snapshot history", async () => {
    stubCairn({ ledgerHomes: async () => ({ ok: true, data: [homeView()] }) });
    render(Config);
    await waitFor(() => expect(screen.getByText("Claude Code")).toBeInTheDocument());
    expect(screen.getByText("theme")).toBeInTheDocument();
    expect(screen.getByText(/auto: manual snapshot/)).toBeInTheDocument();
    expect(screen.getByText("abc1234")).toBeInTheDocument(); // short hash
  });

  it("commits a snapshot with the typed note", async () => {
    const commits: unknown[][] = [];
    stubCairn({
      ledgerHomes: async () => ({ ok: true, data: [homeView()] }),
      ledgerCommit: async (...args: unknown[]) => { commits.push(args); return { ok: true, data: true }; },
    });
    render(Config);
    const note = (await screen.findByPlaceholderText("Snapshot note (optional)")) as HTMLInputElement;
    await fireEvent.input(note, { target: { value: "before edit" } });
    await fireEvent.click(screen.getByRole("button", { name: /snapshot/i }));
    await waitFor(() => expect(commits).toContainEqual(["claude", "before edit"]));
  });

  it("restores a snapshot after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const restores: unknown[][] = [];
    stubCairn({
      ledgerHomes: async () => ({ ok: true, data: [homeView()] }),
      ledgerRestore: async (...args: unknown[]) => { restores.push(args); return { ok: true, data: 1 }; },
    });
    render(Config);
    await fireEvent.click(await screen.findByRole("button", { name: "Restore" }));
    await waitFor(() => expect(restores).toContainEqual(["claude", "abc1234def"]));
  });

  it("surfaces a profile-switch refusal reason", async () => {
    stubCairn({
      ledgerHomes: async () => ({ ok: true, data: [homeView()] }),
      ledgerProfileSwitch: async () => ({ ok: true, data: { ok: false, reason: "uncommitted config changes" } }),
    });
    render(Config);
    await fireEvent.click(await screen.findByRole("button", { name: "work" }));
    await waitFor(() => expect(screen.getByText(/uncommitted config changes/)).toBeInTheDocument());
  });

  it("shows an empty state when no homes are returned", async () => {
    stubCairn({ ledgerHomes: async () => ({ ok: true, data: [] }) });
    render(Config);
    await waitFor(() => expect(screen.getByText(/No app homes detected/)).toBeInTheDocument());
  });
});
