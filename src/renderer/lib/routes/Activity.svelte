<script lang="ts">
  import { onMount } from "svelte";
  import type { ActivityRecord, Impact } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { humanizeId } from "../util/appLabel.js";
  import { setActivityActive } from "../stores/activity.js";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import Chip from "../components/Chip.svelte";
  import ActivityRow from "../components/ActivityRow.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  const IMPACTS: Impact[] = ["debug", "info", "notice", "warning", "error"];
  type Range = "1h" | "24h" | "7d" | "all";
  const HOUR_MS = 3_600_000;
  const RANGE_MS: Record<Range, number> = { "1h": HOUR_MS, "24h": HOUR_MS * 24, "7d": HOUR_MS * 24 * 7, all: 0 };
  const PAGE_LIMIT = 200;
  const MAX_RECORDS = 500;

  let records = $state<ActivityRecord[]>([]);
  let loadError = $state("");
  let loaded = $state(false);
  let activeImpacts = $state<Set<Impact>>(new Set());
  let sourceFilter = $state("");
  let topicFilter = $state("");
  let query = $state("");
  let range = $state<Range>("24h");
  let expandedId = $state<string | null>(null);

  const cutoff = $derived(range === "all" ? 0 : Date.now() - RANGE_MS[range]);

  // Filter options are derived from the records actually present, never a
  // hardcoded app/plugin enum.
  const sources = $derived.by(() => Array.from(new Set(records.map((r) => r.source))).sort());
  const topics = $derived.by(() => Array.from(new Set(records.map((r) => r.topic))).sort());

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return records.filter((r) => {
      if (r.ts < cutoff) return false;
      if (activeImpacts.size > 0 && !activeImpacts.has(r.impact)) return false;
      if (sourceFilter && r.source !== sourceFilter) return false;
      if (topicFilter && r.topic !== topicFilter) return false;
      if (q && !r.text.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  function toggleImpact(impact: Impact): void {
    const next = new Set(activeImpacts);
    if (next.has(impact)) next.delete(impact);
    else next.add(impact);
    activeImpacts = next;
  }

  function toggleExpanded(id: string): void {
    expandedId = expandedId === id ? null : id;
  }

  // Merges by id (priority wins on a duplicate) and sorts newest-first, so a
  // live push that lands during the initial load's async gap survives instead
  // of being wiped out by the fetched page, and a live push received twice
  // doesn't duplicate. Caps the result so a long-running session doesn't grow
  // the in-memory list unbounded.
  function mergeRecords(existing: ActivityRecord[], priority: ActivityRecord[]): ActivityRecord[] {
    const byId = new Map<string, ActivityRecord>();
    for (const record of priority) byId.set(record.id, record);
    for (const record of existing) if (!byId.has(record.id)) byId.set(record.id, record);
    return Array.from(byId.values())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_RECORDS);
  }

  async function load(): Promise<void> {
    const result = await cairn.activityRead({ limit: PAGE_LIMIT });
    if (result.ok) {
      records = mergeRecords(records, result.data.records);
      loadError = "";
    } else {
      loadError = result.error;
    }
    loaded = true;
  }

  onMount(() => {
    setActivityActive(true);
    void load();
    const stopLive = cairn.onActivityEvent((record) => {
      records = mergeRecords(records, [record]);
    });
    return () => {
      stopLive();
      setActivityActive(false);
    };
  });
</script>

<div class="head">
  <div>
    <h1>Activity</h1>
    <p>Live event stream across every connected home.</p>
  </div>
</div>

<div class="filters">
  <div class="impacts" role="group" aria-label="Impact filter">
    {#each IMPACTS as impact (impact)}
      <Chip label={impact} on={activeImpacts.has(impact)} onclick={() => toggleImpact(impact)} />
    {/each}
  </div>
  <select bind:value={sourceFilter} aria-label="Source">
    <option value="">All sources</option>
    {#each sources as source (source)}
      <option value={source}>{humanizeId(source)}</option>
    {/each}
  </select>
  <select bind:value={topicFilter} aria-label="Topic">
    <option value="">All topics</option>
    {#each topics as topic (topic)}
      <option value={topic}>{topic}</option>
    {/each}
  </select>
  <SearchField bind:value={query} placeholder="Search activity" />
  <div class="ranges" role="group" aria-label="Time range">
    <button class:active={range === "1h"} onclick={() => (range = "1h")}>1h</button>
    <button class:active={range === "24h"} onclick={() => (range = "24h")}>24h</button>
    <button class:active={range === "7d"} onclick={() => (range = "7d")}>7d</button>
    <button class:active={range === "all"} onclick={() => (range = "all")}>All</button>
  </div>
</div>

{#if loadError}
  <ErrorState message={`Could not load activity: ${loadError}`} onRetry={load} />
{:else if !loaded}
  <div class="skeletons">
    <Skeleton height="52px" radius="12px" />
    <Skeleton height="52px" radius="12px" />
    <Skeleton height="52px" radius="12px" />
  </div>
{:else if filtered.length === 0}
  <EmptyState message="No activity matches your filters." />
{:else}
  <Card>
    <ul class="list">
      {#each filtered as record (record.id)}
        <li>
          <ActivityRow record={record} expanded={expandedId === record.id} ontoggle={() => toggleExpanded(record.id)} />
        </li>
      {/each}
    </ul>
  </Card>
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .head h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -.02em;
    font-weight: 650;
  }
  .head p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .impacts {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .filters select {
    font-family: var(--ui);
    font-size: 12.5px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .ranges {
    display: flex;
    gap: 2px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 2px;
    flex: none;
    margin-left: auto;
  }
  .ranges button {
    border: none;
    background: none;
    color: var(--muted);
    font-family: var(--ui);
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
  }
  .ranges button.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
</style>
