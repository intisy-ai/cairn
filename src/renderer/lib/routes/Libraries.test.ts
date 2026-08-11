// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor, screen, within } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import { get } from "svelte/store";
import { router } from "../router.js";
import Libraries from "./Libraries.svelte";
import type { HomeLibraries, PluginHome } from "@cairn/shared";

function home(id: string, label: string): PluginHome {
  return { id, label, dir: `/${id}`, present: true, hasUpdater: true };
}

// The same library in two homes, one library used by a plugin, and one used by nothing.
function data(): HomeLibraries[] {
  return [
    {
      home: home("cairn", "Cairn"),
      shared: [
        { specifier: "@intisy-ai/core", version: "2.1.0", usedBy: ["stub-auth"] },
        { specifier: "@intisy-ai/left-behind", version: "1.0.0", usedBy: [] },
      ],
      plugins: [{ plugin: "stub-auth", dependencies: [{ specifier: "undici", version: "6.19.2", usedBy: [] }] }],
    },
    {
      home: home("claude", "Claude Code"),
      shared: [{ specifier: "@intisy-ai/core", version: "2.1.0", usedBy: ["stub-auth"] }],
      plugins: [],
    },
  ];
}

function row(specifier: string): HTMLElement {
  return screen.getByTestId(`library-${specifier}`);
}

describe("Libraries screen", () => {
  // The redesign: a library installed in two homes used to be listed once per home, which
  // read as two libraries.
  it("lists a library once however many homes hold it", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    await screen.findByText("@intisy-ai/core");
    expect(screen.getAllByText("@intisy-ai/core")).toHaveLength(1);
  });

  it("names the homes a library is installed in, beside it", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    const core = await waitFor(() => row("@intisy-ai/core"));
    expect(within(core).getByTitle("Cairn")).toBeInTheDocument();
    expect(within(core).getByTitle("Claude Code")).toBeInTheDocument();
  });

  it("says which plugins use a library, and calls one nothing uses unused", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    expect(within(await waitFor(() => row("@intisy-ai/core"))).getByText("stub-auth")).toBeInTheDocument();
    expect(within(row("@intisy-ai/left-behind")).getByText("used by nothing installed")).toBeInTheDocument();
  });

  it("lists a plugin's own declared dependency too", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);
    expect(await screen.findByText("undici")).toBeInTheDocument();
  });

  it("narrows to the unused ones on demand", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);
    await screen.findByText("@intisy-ai/core");

    await fireEvent.click(screen.getByRole("button", { name: /^Unused/ }));

    await waitFor(() => expect(screen.queryByText("@intisy-ai/core")).toBeNull());
    expect(screen.getByText("@intisy-ai/left-behind")).toBeInTheDocument();
  });

  it("filters by specifier and by the plugin that uses it", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    const { container } = render(Libraries);
    await screen.findByText("@intisy-ai/core");

    await fireEvent.input(container.querySelector("input")!, { target: { value: "stub-auth" } });

    await waitFor(() => expect(screen.queryByText("@intisy-ai/left-behind")).toBeNull());
    expect(screen.getByText("@intisy-ai/core")).toBeInTheDocument();
  });

  // A library nothing declares is removable on its own; one in use is not, and the row offers
  // the only thing that would free it instead.
  it("removes an unused library from every home holding it, after confirming", async () => {
    const librariesRemove = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }), librariesRemove });
    render(Libraries);

    const orphan = await waitFor(() => row("@intisy-ai/left-behind"));
    await fireEvent.click(within(orphan).getByRole("button", { name: "Remove" }));

    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(librariesRemove).toHaveBeenCalledWith("cairn", "@intisy-ai/left-behind"));
  });

  it("offers to uninstall the plugins using a library instead of removing it", async () => {
    const pluginsRemoveEverywhere = vi.fn(async () => ({ ok: true, data: { outcomes: [] } }) as const);
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }), pluginsRemoveEverywhere });
    render(Libraries);

    const core = await waitFor(() => row("@intisy-ai/core"));
    expect(within(core).queryByRole("button", { name: "Remove" })).toBeNull();
    await fireEvent.click(within(core).getByRole("button", { name: "Uninstall users" }));

    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Uninstall" }));

    await waitFor(() => expect(pluginsRemoveEverywhere).toHaveBeenCalledWith("stub-auth"));
  });

  it("shows an inline error when the read fails", async () => {
    stubCairn({ librariesList: async () => ({ ok: false, error: "store unreadable" }) });
    render(Libraries);
    expect(await screen.findByText(/store unreadable/)).toBeInTheDocument();
  });
});

// A library used in one home and left over in another is the common case after uninstalling
// its last consumer there. Merging the two answers made the leftover unremovable, because the
// row claimed a user it only had somewhere else.
describe("a library left over in one home", () => {
  function split(): HomeLibraries[] {
    return [
      { home: home("cairn", "Cairn"), shared: [{ specifier: "@intisy-ai/openai-translator", version: "0.1.1", usedBy: [] }], plugins: [] },
      { home: home("claude", "Claude Code"), shared: [{ specifier: "@intisy-ai/openai-translator", version: "0.1.1", usedBy: ["custom-auth"] }], plugins: [] },
    ];
  }

  it("still offers to remove it, and names the home it is left over in", async () => {
    const librariesRemove = vi.fn(async () => ({ ok: true, data: undefined }) as const);
    stubCairn({ librariesList: async () => ({ ok: true, data: split() }), librariesRemove });
    render(Libraries);

    const entry = await waitFor(() => row("@intisy-ai/openai-translator"));
    expect(within(entry).getByText("left over in Cairn")).toBeInTheDocument();
    await fireEvent.click(within(entry).getByRole("button", { name: "Remove" }));

    const dialog = within(await screen.findByRole("dialog"));
    await fireEvent.click(dialog.getByRole("button", { name: "Remove" }));

    // Only the home that no longer needs it; the one still using it is left alone.
    await waitFor(() => expect(librariesRemove).toHaveBeenCalledWith("cairn", "@intisy-ai/openai-translator"));
    expect(librariesRemove).toHaveBeenCalledTimes(1);
  });

  it("counts as unused for the filter, since there is something to clean up", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: split() }) });
    render(Libraries);
    await screen.findByText("@intisy-ai/openai-translator");

    await fireEvent.click(screen.getByRole("button", { name: /^Unused/ }));

    expect(screen.getByText("@intisy-ai/openai-translator")).toBeInTheDocument();
  });
});

describe("navigating from a library to what uses it", () => {
  it("opens the plugin when its name is clicked", async () => {
    stubCairn({ librariesList: async () => ({ ok: true, data: data() }) });
    render(Libraries);

    const core = await waitFor(() => row("@intisy-ai/core"));
    await fireEvent.click(within(core).getByRole("button", { name: "stub-auth" }));

    await waitFor(() => expect(get(router).screen).toBe("plugins"));
  });
});
