import { describe, it, expect } from "vitest";
import { groupByTrace } from "./activityTrace.js";
import type { ActivityRecord } from "@cairn/shared";

function rec(id: string, ts: number, traceId: string, causedBy?: string): ActivityRecord {
  return {
    id,
    ts,
    home: "/tmp/h",
    topic: "plugin.installed",
    action: "updated",
    actor: "user",
    impact: "info",
    source: "plugin-updater",
    details: {},
    text: id,
    origin: { app: "someapp", home: "/tmp/h" },
    cause: { kind: "user" },
    trace: causedBy ? { id: traceId, causedBy } : { id: traceId },
  } as ActivityRecord;
}

describe("groupByTrace", () => {
  it("puts the events a trace caused under the event that started it", () => {
    const groups = groupByTrace([rec("c", 300, "t1", "a"), rec("b", 200, "t1", "a"), rec("a", 100, "t1")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].root.id).toBe("a");
    expect(groups[0].followers.map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("keeps unrelated traces apart and orders groups newest first", () => {
    const groups = groupByTrace([rec("x", 500, "t2"), rec("a", 100, "t1"), rec("b", 200, "t1", "a")]);
    expect(groups.map((g) => g.root.id)).toEqual(["x", "a"]);
  });

  it("treats a page that starts mid-trace as its own group, using the oldest loaded event as the root", () => {
    const groups = groupByTrace([rec("c", 300, "t1", "a"), rec("b", 200, "t1", "a")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].root.id).toBe("b");
    expect(groups[0].followers.map((r) => r.id)).toEqual(["c"]);
  });

  it("never loses a record", () => {
    const input = [rec("a", 100, "t1"), rec("b", 200, "t1", "a"), rec("x", 500, "t2")];
    const groups = groupByTrace(input);
    const seen = groups.flatMap((g) => [g.root, ...g.followers]).map((r) => r.id).sort();
    expect(seen).toEqual(["a", "b", "x"]);
  });

  it("gives a record with no trace a group of its own", () => {
    const bare = { ...rec("lonely", 400, "t3"), trace: undefined } as unknown as ActivityRecord;
    const groups = groupByTrace([bare, rec("a", 100, "t1")]);
    expect(groups.map((g) => g.root.id)).toEqual(["lonely", "a"]);
    expect(groups[0].followers).toEqual([]);
  });

  it("orders a group by its newest event, not by its root", () => {
    // t1's root is oldest of all, but its cascade is the most recent activity
    const groups = groupByTrace([rec("a", 100, "t1"), rec("b", 900, "t1", "a"), rec("x", 500, "t2")]);
    expect(groups.map((g) => g.root.id)).toEqual(["a", "x"]);
  });

  it("breaks a same-timestamp tie deterministically", () => {
    const first = groupByTrace([rec("b", 100, "t1", "a"), rec("a", 100, "t1")]);
    const second = groupByTrace([rec("a", 100, "t1"), rec("b", 100, "t1", "a")]);
    expect(first[0].root.id).toBe(second[0].root.id);
    expect(first[0].followers.map((r) => r.id)).toEqual(second[0].followers.map((r) => r.id));
  });
});
