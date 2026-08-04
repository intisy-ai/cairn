// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { stubCairn } from "../testing.js";
import Activity from "./Activity.svelte";
import type { ActivityRecord, Result } from "@cairn/shared";

function record(over: Partial<ActivityRecord> & { id: string }): ActivityRecord {
  return {
    id: over.id,
    ts: over.ts ?? Date.now(),
    home: over.home ?? "cairn",
    topic: over.topic ?? "config.changed",
    action: over.action ?? "config_changed",
    actor: over.actor ?? "user",
    impact: over.impact ?? "notice",
    source: over.source ?? "config-ledger",
    subject: over.subject,
    details: over.details ?? { key: "value" },
    text: over.text ?? "Something happened",
  };
}

beforeEach(() => {
  stubCairn({
    activityRead: async () => ({
      ok: true,
      data: {
        records: [
          record({ id: "e1", impact: "error", source: "core-proxy", topic: "provider.failed", text: "Upstream request failed" }),
          record({ id: "n1", impact: "notice", source: "config-ledger", topic: "config.changed", text: "Configuration saved" }),
        ],
      },
    }),
  });
});

async function mount() {
  const utils = render(Activity);
  // allow onMount async load to resolve
  await new Promise((r) => setTimeout(r, 0));
  return utils;
}

describe("Activity screen", () => {
  it("lists both loaded records", async () => {
    const { getByText } = await mount();
    expect(getByText("Upstream request failed")).toBeInTheDocument();
    expect(getByText("Configuration saved")).toBeInTheDocument();
  });

  it("hides other impacts when the error filter is toggled on", async () => {
    const { getByText, queryByText } = await mount();
    await fireEvent.click(getByText("error"));
    expect(getByText("Upstream request failed")).toBeInTheDocument();
    expect(queryByText("Configuration saved")).toBeNull();
  });

  it("keeps a live record that arrives before the initial load resolves", async () => {
    type ReadResult = Result<{ records: ActivityRecord[] }>;
    let resolveLoad: ((value: ReadResult) => void) | undefined;
    const pending = new Promise<ReadResult>((resolve) => {
      resolveLoad = resolve;
    });
    let liveHandler: ((r: ActivityRecord) => void) | undefined;
    stubCairn({
      activityRead: async () => pending,
      onActivityEvent: (listener) => {
        liveHandler = listener;
        return () => {};
      },
    });

    const { getByText } = render(Activity);
    // let onMount run and the activityRead call start, without resolving it yet
    await new Promise((r) => setTimeout(r, 0));

    liveHandler?.(record({ id: "live1", impact: "error", text: "Live-arrived failure" }));

    resolveLoad?.({
      ok: true,
      data: { records: [record({ id: "n1", impact: "notice", text: "Configuration saved" })] },
    });
    await new Promise((r) => setTimeout(r, 0));

    expect(getByText("Live-arrived failure")).toBeInTheDocument();
    expect(getByText("Configuration saved")).toBeInTheDocument();
  });
});
