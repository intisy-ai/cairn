import type { ActivityRecord } from "@cairn/shared";

export interface ActivityGroup {
  root: ActivityRecord;
  followers: ActivityRecord[];
}

// One group per trace: the event that started it, then what it caused, oldest first.
// A page can begin mid-trace (its root is on an older page), so the oldest record
// loaded for that trace stands in as the root rather than the group disappearing.
export function groupByTrace(records: ActivityRecord[]): ActivityGroup[] {
  const byTrace = new Map<string, ActivityRecord[]>();
  for (const record of records) {
    const key = record.trace?.id || record.id;
    const list = byTrace.get(key) ?? [];
    list.push(record);
    byTrace.set(key, list);
  }

  const groups: ActivityGroup[] = [];
  for (const list of byTrace.values()) {
    const ordered = list.slice().sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
    const rootIndex = ordered.findIndex((r) => !r.trace?.causedBy);
    const root = rootIndex >= 0 ? ordered[rootIndex] : ordered[0];
    groups.push({ root, followers: ordered.filter((r) => r !== root) });
  }

  return groups.sort((a, b) => newestTs(b) - newestTs(a) || a.root.id.localeCompare(b.root.id));
}

function newestTs(group: ActivityGroup): number {
  return group.followers.length ? group.followers[group.followers.length - 1].ts : group.root.ts;
}
