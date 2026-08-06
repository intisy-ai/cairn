<script lang="ts">
  import { onMount } from "svelte";
  import type { ActivityRecord } from "@cairn/shared";
  import { formatBytes, formatRate, formatDuration } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { rows, cancelRow, clearFinished, type DownloadRow } from "../downloads.js";
  import { humanizeId } from "../util/appLabel.js";
  import PageHeader from "../components/PageHeader.svelte";
  import Card from "../components/Card.svelte";
  import Button from "../components/Button.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import SpeedGraph from "../charts/SpeedGraph.svelte";

  const LIVE = ["pending", "installing", "cancelling"];
  const active = $derived($rows.filter((r) => r.status === "installing" || r.status === "cancelling"));
  const queued = $derived($rows.filter((r) => r.status === "pending"));
  const recentRows = $derived($rows.filter((r) => !LIVE.includes(r.status)));

  // History is whatever the activity log already recorded, so it survives a restart with no
  // storage of its own. Cleared entries are hidden here, never deleted from the log.
  let history = $state<ActivityRecord[]>([]);
  let hiddenBefore = $state(0);
  let now = $state(Date.now());

  let installed = $state<Set<string>>(new Set());

  async function loadInstalled(): Promise<void> {
    const result = await cairn.pluginsList();
    if (!result.ok) return;
    installed = new Set(result.data.flatMap((section) => section.rows.map((row) => row.name)));
  }

  async function loadHistory(): Promise<void> {
    const result = await cairn.activityRead({ topics: ["plugin.installed"], limit: 200 });
    if (result.ok) history = result.data.records;
  }

  onMount(() => {
    void loadInstalled();
    void loadHistory();
    const tick = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(tick);
  });

  // Reload history whenever live work finishes, so a completed job appears without a revisit.
  let lastLiveCount = $state(-1);
  $effect(() => {
    const live = active.length + queued.length;
    if (lastLiveCount > 0 && live === 0) {
      void loadInstalled();
      void loadHistory();
    }
    lastLiveCount = live;
  });

  function elapsed(row: DownloadRow): string {
    return formatDuration(Math.max(0, (row.endedAt ?? now) - (row.startedAt ?? row.queuedAt)));
  }

  function shortVersion(value: unknown): string {
    return typeof value === "string" && value ? value.slice(0, 8) : "";
  }

  function versionChange(record: ActivityRecord): { from: string; to: string } {
    return {
      from: shortVersion(record.details?.fromVersion),
      to: shortVersion(record.details?.toVersion ?? record.details?.version),
    };
  }

  function historyHome(record: ActivityRecord): string {
    return record.origin?.app ? humanizeId(record.origin.app) : "";
  }

  function outcomeOf(record: ActivityRecord): string {
    return record.outcome === "failed" ? "failed" : "ok";
  }

  const visibleHistory = $derived.by(() => {
    const seen = new Set<string>();
    const out: ActivityRecord[] = [];
    for (const record of [...history].sort((a, b) => b.ts - a.ts)) {
      const plugin = record.subject?.id;
      if (!plugin || record.ts <= hiddenBefore) continue;
      if (!installed.has(plugin)) continue;
      const key = `${plugin}:${record.origin?.app ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(record);
    }
    return out;
  });
  const hasAnything = $derived(active.length + queued.length + recentRows.length + visibleHistory.length > 0);
  const totalRate = $derived(active.reduce((sum, r) => sum + (r.bytesPerSecond ?? 0), 0));

  function clearAll(): void {
    clearFinished();
    hiddenBefore = Date.now();
  }
</script>

<PageHeader title="Downloads" subtitle="Plugin work Cairn is doing, queued, or has done">
  {#snippet actions()}
    {#if totalRate > 0}
      <span class="headrate" data-testid="total-rate">{formatRate(totalRate)}</span>
    {/if}
    {#if recentRows.length > 0 || visibleHistory.length > 0}
      <Button variant="ghost" onclick={clearAll}>Clear history</Button>
    {/if}
  {/snippet}
</PageHeader>

{#if !hasAnything}
  <EmptyState message="Nothing has been downloaded yet. Installing a plugin queues it here." />
{:else}
  {#if active.length > 0}
    {#each active as row (row.id)}
      <Card>
        <div class="job" data-testid="active-job">
          <div class="head">
            <div class="who">
              <span class="name">{row.label}</span>
              <span class="into">into</span>
              <span class="home">{row.home}</span>
            </div>
            <div class="act">
              <span class="clock">{elapsed(row)}</span>
              {#if row.cancellable}
                <Button variant="ghost" onclick={() => cancelRow(row)}>Cancel</Button>
              {:else if row.status === "cancelling"}
                <span class="cancelling">Cancelling…</span>
              {/if}
            </div>
          </div>

          <div class="meter">
            <div class="track">
              <!-- The width eases, so real progress reads as motion rather than as jumps. -->
              <span class="fill" class:indeterminate={row.percent < 0} style={row.percent >= 0 ? `width:${Math.max(2, row.percent)}%` : undefined}></span>
            </div>
            <span class="pct">{row.percent >= 0 ? `${row.percent}%` : "--"}</span>
          </div>

          <dl class="stats">
            <div><dt>Stage</dt><dd>{row.step || "starting"}</dd></div>
            {#if row.bytes !== undefined}
              <div><dt>Transferred</dt><dd class="num">{formatBytes(row.bytes)}</dd></div>
            {/if}
            {#if row.bytesPerSecond !== undefined}
              <div><dt>Rate</dt><dd class="num">{formatRate(row.bytesPerSecond)}</dd></div>
            {/if}
          </dl>

          {#if row.samples.length > 1}
            <SpeedGraph samples={row.samples} height={34} label={row.label} />
          {/if}

          {#if row.phases.length > 0}
            <ol class="trail">
              {#each row.phases as phase (phase.name)}
                <li><span class="pname">{phase.name}</span><span class="pms num">{formatDuration(phase.ms)}</span></li>
              {/each}
              <li class="running"><span class="pname">{row.step}</span><span class="pms num">running</span></li>
            </ol>
          {/if}
        </div>
      </Card>
    {/each}
  {/if}

  {#if queued.length > 0}
    <Card>
      <h3 class="section">Queued <span class="count">{queued.length}</span></h3>
      <ol class="queue">
        {#each queued as row, index (row.id)}
          <li data-testid="queued-job">
            <span class="pos num">{index + 1}</span>
            <span class="name">{row.label}</span>
            <span class="home">{row.home}</span>
            <span class="grow"></span>
            <span class="waiting">waiting</span>
            {#if row.cancellable}
              <Button variant="ghost" onclick={() => cancelRow(row)}>Cancel</Button>
            {/if}
          </li>
        {/each}
      </ol>
    </Card>
  {/if}

  {#if recentRows.length > 0 || visibleHistory.length > 0}
    <Card>
      <table class="log">
        <thead>
          <tr>
            <th>Result</th>
            <th>Work</th>
            <th>Home</th>
            <th class="num">Took</th>
            <th class="num">Version</th>
          </tr>
        </thead>
        <tbody>
          {#each recentRows as row (row.id)}
            <tr data-testid="recent-row">
              <td class="out out-{row.status}">{row.status === "done" ? "ok" : row.status}</td>
              <td class="lname">{row.label}</td>
              <td class="lhome">{row.home}</td>
              <td class="ltime num">{elapsed(row)}</td>
              <td class="lver">{#if row.error}<span class="err" title={row.error}>{row.error}</span>{/if}</td>
            </tr>
          {/each}
          {#each visibleHistory as record (record.id)}
            {@const change = versionChange(record)}
            <tr data-testid="history-row">
              <td class="out out-{outcomeOf(record)}">{outcomeOf(record)}</td>
              <td class="lname">{record.subject?.label ?? record.subject?.id}</td>
              <td class="lhome">{historyHome(record)}</td>
              <td class="ltime num">{typeof record.durationMs === "number" ? formatDuration(record.durationMs) : ""}</td>
              <td class="lver num">
                {#if change.from && change.to}<span class="from">{change.from}</span><span class="to">{change.to}</span>
                {:else if change.to}<span class="to">{change.to}</span>{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </Card>
  {/if}
{/if}

<style>
  .headrate {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--accent);
  }

  /* Active job: an instrument panel, read top to bottom. */
  .job {
    display: grid;
    gap: 14px;
  }
  .head {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .who {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
  }
  .name {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .into {
    font-size: 11px;
    color: var(--faint);
  }
  .home {
    font-size: 11px;
    color: var(--muted);
    padding: 1px 7px;
    border: 1px solid var(--border);
    border-radius: 999px;
    white-space: nowrap;
  }
  .act {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
  .clock,
  .cancelling {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    color: var(--muted);
  }

  .meter {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .track {
    position: relative;
    flex: 1;
    height: 6px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white));
    /* Progress arrives in real steps from git; easing turns them into movement. */
    transition: width 420ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .fill.indeterminate {
    width: 34%;
    animation: sweep 1.4s ease-in-out infinite;
    transition: none;
  }
  @keyframes sweep {
    0% { transform: translateX(-110%); }
    100% { transform: translateX(320%); }
  }
  .pct {
    min-width: 42px;
    text-align: right;
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    color: var(--text);
  }

  .stats {
    display: flex;
    gap: 26px;
    margin: 0;
  }
  .stats div {
    display: grid;
    gap: 2px;
  }
  dt {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--faint);
  }
  dd {
    margin: 0;
    font-size: 12.5px;
    color: var(--text);
  }
  .num {
    font-family: var(--mono);
    font-variant-numeric: tabular-nums;
  }

  .trail {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .trail li {
    display: flex;
    gap: 6px;
    align-items: baseline;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface-2);
  }
  .trail .pname {
    font-size: 11px;
    color: var(--muted);
  }
  .trail .pms {
    font-size: 10.5px;
    color: var(--faint);
  }
  .trail li.running {
    border-color: var(--accent-border);
    background: var(--accent-weak);
  }
  .trail li.running .pname {
    color: var(--accent);
  }

  .section {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--faint);
  }
  .count {
    font-family: var(--mono);
    color: var(--muted);
  }

  .queue {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .queue li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-top: 1px solid var(--border);
  }
  .queue li:first-child {
    border-top: none;
  }
  .pos {
    width: 18px;
    font-size: 11px;
    color: var(--faint);
  }
  .queue .name {
    font-size: 13px;
    font-weight: 500;
  }
  .grow {
    flex: 1;
  }
  .waiting {
    font-size: 11px;
    color: var(--faint);
  }

  /* History as a real table so every column lines up down the page. */
  .log {
    width: 100%;
    border-collapse: collapse;
  }
  .log tr {
    border-top: 1px solid var(--border);
  }
  .log tr:first-child {
    border-top: none;
  }
  .log th {
    text-align: left;
    padding: 0 12px 8px 0;
    font-size: 11px;
    font-weight: 600;
    color: var(--faint);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .log th.num {
    text-align: right;
  }
  .log td {
    padding: 5px 12px 5px 0;
    font-size: 12.5px;
    vertical-align: baseline;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .out {
    width: 58px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }
  .out-done,
  .out-ok {
    color: var(--good);
  }
  .out-failed {
    color: var(--crit);
  }
  .out-cancelled {
    color: var(--faint);
  }
  .lname {
    font-weight: 500;
    max-width: 0;
  }
  .lhome {
    color: var(--muted);
    font-size: 11.5px;
    width: 26%;
    max-width: 0;
  }
  .ltime {
    width: 76px;
    text-align: right;
    color: var(--muted);
    font-size: 11.5px;
  }
  .lver {
    width: 30%;
    text-align: right;
    font-size: 11px;
    color: var(--faint);
    white-space: nowrap;
  }
  .lver .from::after {
    content: "→";
    margin: 0 5px;
    color: var(--border-strong);
  }
  .lver .to {
    color: var(--muted);
  }
  .err {
    color: var(--crit);
    font-size: 11px;
  }
</style>
