// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, fireEvent, waitFor, screen } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Libraries from "./Libraries.svelte";
import type { HomeLibraries, PluginHome } from "@cairn/shared";

function home(id: string, label: string): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true };
}

function data(): HomeLibraries[] {
  return [
    {
      home: home("cairn", "Cairn"),
      shared: [{ specifier: "@intisy-ai/core", version: "2.1.0", usedBy: ["stub-auth"] }],
      plugins: [{ plugin: "stub-auth", dependencies: [{ specifier: "undici", version: "6.19.2", usedBy: [] }] }],
    },
    {
      home: home("claude", "Claude Code"),
      shared: [{ specifier: "@intisy-ai/core-auth", version: "1.4.0", usedBy: [] }],
      plugins: [],
    },
  ];
}

describe("Libraries screen", () => {
  it("lists the shared store and each plugin's dependencies per home", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    expect(await screen.findByText("@intisy-ai/core")).toBeInTheDocument();
    expect(screen.getByText("2.1.0")).toBeInTheDocument();
    expect(screen.getByText("undici")).toBeInTheDocument();
    expect(screen.getByText("@intisy-ai/core-auth")).toBeInTheDocument();
    expect(screen.getByText("Cairn")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  // The point of tracking who declares a shared library is knowing when nothing does.
  it("names the plugins declaring a shared library, and says so when none do", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    expect(await screen.findByText("stub-auth", { selector: ".users" })).toBeInTheDocument();
    expect(screen.getByText("unused")).toBeInTheDocument();
  });

  it("drops a home once nothing in it matches the search", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);
    await screen.findByText("@intisy-ai/core");

    await fireEvent.input(screen.getByLabelText("Search libraries"), { target: { value: "core-auth" } });

    await waitFor(() => expect(screen.queryByText("Cairn")).toBeNull());
    expect(screen.getByText("@intisy-ai/core-auth")).toBeInTheDocument();
  });

  it("hides plugin dependencies behind the shared-only filter", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);
    await screen.findByText("undici");

    await fireEvent.click(screen.getByRole("button", { name: "Shared only" }));

    await waitFor(() => expect(screen.queryByText("undici")).toBeNull());
    expect(screen.getByText("@intisy-ai/core")).toBeInTheDocument();
  });

  // A declared dependency that never installed is the reason to open this screen at all.
  it("calls out a dependency that is declared but not installed", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: [{
      home: home("cairn", "Cairn"),
      shared: [],
      plugins: [{ plugin: "stub-auth", dependencies: [{ specifier: "undici", version: "", usedBy: [] }] }],
    }] }) });
    render(Libraries);

    expect(await screen.findByText("not installed")).toBeInTheDocument();
  });

  it("offers a retry when the listing fails", async () => {
    let calls = 0;
    stubCairn({
      librariesList: async () => {
        calls += 1;
        return calls === 1 ? { ok: false, error: "engine missing" } : { ok: true, data: data() };
      },
    });
    render(Libraries);

    await screen.findByText(/engine missing/);
    await fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(await screen.findByText("@intisy-ai/core")).toBeInTheDocument();
  });
});
