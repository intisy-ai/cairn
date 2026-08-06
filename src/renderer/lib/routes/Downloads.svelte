<script lang="ts">
  import { onMount } from "svelte";
  import type { ActivityRecord } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { rows, cancelRow, clearFinished, type DownloadRow } from "../downloads.js";
  import { humanizeId } from "../util/appLabel.js";
  import PageHeader from "../components/PageHeader.svelte";
  import Card from "../components/Card.svelte";
  import Button from "../components/Button.svelte";
  import EmptyState from "../components/EmptyState.svelte";

  const LIVE = ["pending", "installing", "cancelling"];
  const active = $derived($rows.filter((r) => r.status === "installing" || r.status === "cancelling"));
  const queued = $derived($rows.filter((r) => r.status === "pending"));
  const recentRows = $derived($rows.filter((r) => !LIVE.includes(r.status)));

  // History is whatever the activity log already recorded, so it survives a restart with no
  // storage of its own. Cleared entries are hidden here, never deleted from the log.
  let history = $state<ActivityRecord[]>([]);
  let hiddenBefore = $state(0);
  let now = $state(Date.now());

  async function loadHistory(): Promise<void> {
    const result = await cairn.activityRead({ topics: ["plugin.installed"], limit: 50 });
    if (result.ok) history = result.data.records;
  }

  onMount(() => {
    void loadHistory();
    const tick = setInterval(() => (now = Date.now()), 500);
    return () => clearInterval(tick);
  });

  // Reload history whenever live work finishes, so a completed job appears without a revisit.
  let lastLiveCount = $state(-1);
  $effect(() => {
    const live = active.length + queued.length;
    if (lastLiveCount > 0 && live === 0) void loadHistory();
    lastLiveCount = live;
  });

  function duration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60_000);
    return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
  }

  function elapsed(row: DownloadRow): string {
    return duration(Math.max(0, (row.endedAt ?? now) - (row.startedAt ?? row.queuedAt)));
  }

  // Each finished phase with the time it really took, then the one still running.
  function phaseTrail(row: DownloadRow): string {
    const done = row.phases.map((p) => `${p.name} ${duration(p.ms)}`);
    const current = row.step && !row.endedAt ? [`${row.step} …`] : [];
    return [...done, ...current].join("  ›  ") || "starting";
  }

  function shortVersion(value: unknown): string {
    return typeof value === "string" && value ? value.slice(0, 8) : "";
  }

  function versionChange(record: ActivityRecord): string {
    const from = shortVersion(record.details?.fromVersion);
    const to = shortVersion(record.details?.toVersion ?? record.details?.version);
    if (from && to) return `${from} → ${to}`;
    return to ? `→ ${to}` : "";
  }

  function historyHome(record: ActivityRecord): string {
    return record.origin?.app ? humanizeId(record.origin.app) : "";
  }

  const visibleHistory = $derived(history.filter((r) => r.ts > hiddenBefore));
  const hasAnything = $derived(active.length + queued.length + recentRows.length + visibleHistory.length > 0);

  function clearAll(): void {
    clearFinished();
    hiddenBefore = Date.now();
  }
</script>

<PageHeader title="Downloads" subtitle="Plugin work Cairn is doing, queued, or has done">
  {#snippet actions()}
    {#if recentRows.length > 0 || visibleHistory.length > 0}
      <Button variant="ghost" onclick={clearAll}>Clear history</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if !hasAnything}
  <EmptyState message="Nothing has been downloaded yet. Installing a plugin queues it here." />
{:else}
  {#if active.length > 0}
    <Card>
      <h3 class="section">Active</h3>
      {#each active as row (row.id)}
        <div class="job" data-testid="active-job">
          <div class="top">
            <span class="name">{row.label}</span>
            <span class="arrow">→</span>
            <span class="home">{row.home}</span>
            <span class="spacer"></span>
            <span class="time">{elapsed(row)}</span>
            {#if row.cancellable}
              <Button variant="ghost" onclick={() => cancelRow(row)}>Cancel</Button>
            {:else if row.status === "cancelling"}
              <span class="cancelling">Cancelling…</span>
            {/if}
          </div>
          <div class="bar">
            {#if row.percent >= 0}
              <span class="fill det" style={`width:${Math.max(4, row.percent)}%`}></span>
            {:else}
              <span class="fill"></span>
            {/if}
          </div>
          <div class="trail">{phaseTrail(row)}</div>
        </div>
      {/each}
    </Card>
  {/if}

  {#if queued.length > 0}
    <Card>
      <h3 class="section">Queued ({queued.length})</h3>
      {#each queued as row (row.id)}
        <div class="job queued" data-testid="queued-job">
          <div class="top">
            <span class="name">{row.label}</span>
            <span class="arrow">→</span>
            <span class="home">{row.home}</span>
            <span class="spacer"></span>
            <span class="waiting">waiting</span>
            {#if row.cancellable}
              <Button variant="ghost" onclick={() => cancelRow(row)}>Cancel</Button>
            {/if}
          </div>
        </div>
      {/each}
    </Card>
  {/if}

  {#if recentRows.length > 0 || visibleHistory.length > 0}
    <Card>
      <h3 class="section">Recent</h3>
      {#each recentRows as row (row.id)}
        <div class="entry" data-testid="recent-row">
          <span class="outcome outcome-{row.status}">{row.status === "done" ? "ok" : row.status}</span>
          <span class="name">{row.label}</span>
          <span class="home">{row.home}</span>
          <span class="spacer"></span>
          <span class="time">{elapsed(row)}</span>
          {#if row.error}<span class="err" title={row.error}>{row.error}</span>{/if}
        </div>
      {/each}
      {#each visibleHistory as record (record.id)}
        <div class="entry" data-testid="history-row">
          <span class="outcome outcome-{record.outcome === "failed" ? "failed" : "done"}">{record.outcome === "failed" ? "failed" : "ok"}</span>
          <span class="name">{record.subject?.label ?? record.subject?.id ?? record.action}</span>
          <span class="home">{historyHome(record)}</span>
          <span class="spacer"></span>
          {#if typeof record.durationMs === "number"}<span class="time">{duration(record.durationMs)}</span>{/if}
          {#if versionChange(record)}<span class="ver">{versionChange(record)}</span>{/if}
        </div>
      {/each}
    </Card>
  {/if}
{/if}

<style>
  .section {
    margin: 0 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }
  .job {
    padding: 10px 0;
    border-top: 1px solid var(--border);
  }
  .job:first-of-type {
    border-top: none;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .spacer {
    flex: 1;
  }
  .name {
    font-weight: 600;
  }
  .arrow,
  .home,
  .time,
  .waiting,
  .cancelling {
    color: var(--muted);
    font-size: 12px;
  }
  .bar {
    position: relative;
    height: 4px;
    margin: 8px 0 6px;
    border-radius: 2px;
    background: var(--border);
    overflow: hidden;
  }
  .fill {
    position: absolute;
    inset: 0;
    background: var(--accent);
    animation: slide 1.2s ease-in-out infinite;
  }
  .fill.det {
    position: static;
    display: block;
    height: 100%;
    animation: none;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }
  .trail {
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
    font-size: 13px;
  }
  .entry:first-of-type {
    border-top: none;
  }
  .outcome {
    min-width: 54px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .outcome-done { color: var(--accent); }
  .outcome-failed { color: var(--crit); }
  .outcome-cancelled { color: var(--muted); }
  .err {
    color: var(--crit);
    font-size: 11px;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ver {
    color: var(--muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
</style>
