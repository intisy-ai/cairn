<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { ConfigHomeView } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import Card from "../components/Card.svelte";
  import Button from "../components/Button.svelte";
  import Spinner from "../components/Spinner.svelte";
  import PluginIcon, { LOGO_SIZE } from "../components/PluginIcon.svelte";

  let homes = $state<ConfigHomeView[]>([]);
  let error = $state("");
  let loading = $state(true);
  let busy = $state<Record<string, boolean>>({});
  let reasons = $state<Record<string, string>>({});
  let newProfile = $state<Record<string, string>>({});
  let notice = $state<Record<string, string>>({});

  async function load(): Promise<void> {
    const result = await cairn.ledgerHomes();
    if (result.ok) {
      homes = result.data;
      error = "";
    } else {
      error = result.error;
    }
    loading = false;
  }

  function setBusy(id: string, on: boolean): void {
    busy = { ...busy, [id]: on };
  }

  async function commit(id: string): Promise<void> {
    if (busy[id]) return;
    setBusy(id, true);
    try {
      await cairn.ledgerCommit(id, (reasons[id] || "").trim() || "manual snapshot");
      reasons = { ...reasons, [id]: "" };
      await load();
    } finally {
      setBusy(id, false);
    }
  }

  async function restore(id: string, ref: string): Promise<void> {
    if (busy[id]) return;
    if (!confirm("Restore this app's live config to the selected snapshot? Uncommitted changes will be overwritten.")) return;
    setBusy(id, true);
    try {
      await cairn.ledgerRestore(id, ref);
      await load();
    } finally {
      setBusy(id, false);
    }
  }

  async function createProfile(id: string): Promise<void> {
    const name = (newProfile[id] || "").trim();
    if (!name || busy[id]) return;
    setBusy(id, true);
    try {
      await cairn.ledgerProfileCreate(id, name);
      newProfile = { ...newProfile, [id]: "" };
      await load();
    } finally {
      setBusy(id, false);
    }
  }

  async function switchProfile(id: string, name: string): Promise<void> {
    if (busy[id]) return;
    setBusy(id, true);
    try {
      const result = await cairn.ledgerProfileSwitch(id, name);
      notice = { ...notice, [id]: result.ok && !result.data.ok ? (result.data.reason ?? "Could not switch profile.") : "" };
      await load();
    } finally {
      setBusy(id, false);
    }
  }

  // Follow config/sync activity from any source: a light poll of the bus drain
  // reloads the view when a snapshot, change, or sync lands, so the timeline
  // stays current even when the change came from a plugin, not this screen.
  let poll: ReturnType<typeof setInterval> | undefined;
  async function pollBus(): Promise<void> {
    const result = await cairn.busDrain();
    if (result.ok && result.data.some((e) => e.topic.startsWith("config.") || e.topic.startsWith("sync."))) {
      await load();
    }
  }

  onMount(() => {
    load();
    poll = setInterval(pollBus, 5000);
  });
  onDestroy(() => {
    if (poll) clearInterval(poll);
  });

  function shortHash(hash: string): string {
    return hash.slice(0, 7);
  }

  const MAX_VALUE = 72;
  function truncate(value: string): string {
    return value.length > MAX_VALUE ? value.slice(0, MAX_VALUE - 1) + "…" : value;
  }

  type PendingGroup = { file: string; rows: ConfigHomeView["pending"] };
  function groupByFile(rows: ConfigHomeView["pending"]): PendingGroup[] {
    const byFile = new Map<string, ConfigHomeView["pending"]>();
    for (const row of rows) {
      const list = byFile.get(row.file) ?? [];
      list.push(row);
      byFile.set(row.file, list);
    }
    return [...byFile.entries()].map(([file, r]) => ({ file, rows: r })).sort((a, b) => a.file.localeCompare(b.file));
  }
</script>

<div class="head">
  <div>
    <h1>Config</h1>
    <p>Versioned config history, rollback, and profiles for each app, kept in step across them.</p>
  </div>
  <Button onclick={load} title="Reload">Reload</Button>
</div>

{#if error}
  <p class="error">Could not load config history: {error}</p>
{/if}

{#if loading}
  <div class="loading"><Spinner /></div>
{:else if homes.length === 0}
  <p class="empty">No app homes detected.</p>
{/if}

{#each homes as home (home.homeId)}
  <section class="apphome" data-testid={"config-home-" + home.homeId}>
    <div class="apphead">
      <PluginIcon icon={home.icon} name={home.label} size={LOGO_SIZE.compact} />
      <h2>{home.label}</h2>
      {#if home.profiles.current}<span class="profile-tag">{home.profiles.current}</span>{/if}
    </div>

    <Card>
      <div class="block">
        <div class="block-head">
          <b>Pending changes{#if home.pending.length > 0} <span class="count">{home.pending.length}</span>{/if}</b>
          <div class="commit">
            <input
              class="reason"
              placeholder="Snapshot note (optional)"
              value={reasons[home.homeId] ?? ""}
              oninput={(e) => (reasons = { ...reasons, [home.homeId]: (e.currentTarget as HTMLInputElement).value })}
            />
            <Button variant="primary" disabled={busy[home.homeId] || home.pending.length === 0} onclick={() => commit(home.homeId)}>
              {#if busy[home.homeId]}<Spinner />{/if}
              Snapshot
            </Button>
          </div>
        </div>
        {#if home.pending.length === 0}
          <p class="muted">No uncommitted changes.</p>
        {:else}
          {#each groupByFile(home.pending) as group (group.file)}
            <details class="pfile" open={group.rows.length <= 8}>
              <summary><span class="fname">{group.file}</span> <span class="count">{group.rows.length}</span></summary>
              <ul class="diff">
                {#each group.rows as row (row.key)}
                  <li>
                    <span class="key">{row.key}</span>
                    <span class="old" title={row.old}>{truncate(row.old)}</span>
                    <span class="arrow">→</span>
                    <span class="new" title={row.new}>{truncate(row.new)}</span>
                  </li>
                {/each}
              </ul>
            </details>
          {/each}
        {/if}
      </div>

      <div class="block">
        <b>History</b>
        {#if home.snapshots.length === 0}
          <p class="muted">No snapshots yet. Take one to start tracking changes.</p>
        {:else}
          <ul class="snaps">
            {#each home.snapshots as snap (snap.hash)}
              <li>
                <div class="snap-info">
                  <code>{shortHash(snap.hash)}</code>
                  <span class="subject">{snap.subject}</span>
                  <span class="date">{snap.date}</span>
                </div>
                <Button disabled={busy[home.homeId]} onclick={() => restore(home.homeId, snap.hash)}>Restore</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="block">
        <b>Profiles</b>
        {#if notice[home.homeId]}<p class="warn">{notice[home.homeId]}</p>{/if}
        <div class="profiles">
          {#each home.profiles.list as name (name)}
            <button
              class="pchip"
              class:active={name === home.profiles.current}
              disabled={busy[home.homeId] || name === home.profiles.current}
              onclick={() => switchProfile(home.homeId, name)}
            >{name}</button>
          {/each}
          {#if home.profiles.list.length === 0}
            <span class="muted">No profiles yet.</span>
          {/if}
        </div>
        <div class="new-profile">
          <input
            class="reason"
            placeholder="New profile name"
            value={newProfile[home.homeId] ?? ""}
            oninput={(e) => (newProfile = { ...newProfile, [home.homeId]: (e.currentTarget as HTMLInputElement).value })}
          />
          <Button disabled={busy[home.homeId] || !(newProfile[home.homeId] ?? "").trim()} onclick={() => createProfile(home.homeId)}>Create</Button>
        </div>
      </div>
    </Card>
  </section>
{/each}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
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
  .apphome {
    margin-bottom: 18px;
  }
  .apphead {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 0 2px 8px;
  }
  .apphead h2 {
    margin: 0;
    font-size: 13px;
    font-weight: 650;
  }
  .profile-tag {
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 9px;
  }
  .block {
    padding: 14px 18px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .block:first-child {
    border-top: 0;
  }
  .block b {
    font-size: 12.5px;
    font-weight: 650;
  }
  .block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .commit,
  .new-profile {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .reason {
    font-family: var(--ui);
    font-size: 12px;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    min-width: 180px;
  }
  .muted {
    margin: 0;
    color: var(--muted);
    font-size: 12px;
  }
  .diff,
  .snaps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .diff li {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 12px;
    font-family: var(--mono, monospace);
  }
  .diff .key {
    font-weight: 600;
    min-width: 0;
  }
  .diff .old {
    color: var(--crit);
    max-width: 40ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .diff .arrow {
    color: var(--faint);
  }
  .diff .new {
    color: var(--accent);
    max-width: 40ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pfile {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 0;
  }
  .pfile summary {
    cursor: pointer;
    padding: 6px 12px;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    list-style: none;
  }
  .pfile summary::-webkit-details-marker {
    display: none;
  }
  .pfile .fname {
    font-family: var(--mono, monospace);
    font-weight: 600;
  }
  .pfile .diff {
    padding: 4px 12px 8px;
  }
  .count {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 1px 7px;
  }
  .snaps li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .snap-info {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }
  .snap-info code {
    font-size: 11.5px;
    color: var(--muted);
  }
  .snap-info .subject {
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .snap-info .date {
    font-size: 11px;
    color: var(--faint);
    white-space: nowrap;
  }
  .profiles {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .pchip {
    font-family: var(--ui);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
  }
  .pchip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    cursor: default;
  }
  .pchip:disabled:not(.active) {
    opacity: .5;
    cursor: not-allowed;
  }
  .warn {
    margin: 0;
    color: var(--warn, #b8860b);
    font-size: 12px;
  }
  .loading {
    padding: 20px 0;
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
