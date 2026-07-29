<script lang="ts">
  import { onMount } from "svelte";
  import type { HostApp, AppPresence, AppSummary } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import Card from "../components/Card.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import Chip from "../components/Chip.svelte";
  import Button from "../components/Button.svelte";

  const PROVIDER_BREAKDOWN_CAP = 6;

  let apps = $state<HostApp[]>([]);
  let presence = $state<AppPresence>({});
  let appsError = $state("");

  let busy = $state<Record<string, boolean>>({});
  let summaries = $state<Record<string, AppSummary | null>>({});
  let summaryErrors = $state<Record<string, string>>({});
  const summaryGen: Record<string, number> = {};

  let uninstallOpen = $state<Record<string, boolean>>({});
  let uninstallWipe = $state<Record<string, boolean>>({});

  const visibleApps = $derived(apps.filter((app) => app.id !== "cairn"));

  async function loadApps(): Promise<void> {
    const result = await cairn.appsList();
    if (result.ok) apps = result.data;
  }

  async function loadPresence(): Promise<void> {
    const result = await cairn.appsDetect();
    if (result.ok) {
      presence = result.data;
      appsError = "";
    } else {
      appsError = result.error;
    }
  }

  function loadSummary(app: string): void {
    const gen = (summaryGen[app] ?? 0) + 1;
    summaryGen[app] = gen;
    summaries = { ...summaries, [app]: null };
    summaryErrors = { ...summaryErrors, [app]: "" };
    cairn.appsSummary(app).then((result) => {
      if (summaryGen[app] !== gen) return;
      if (result.ok) {
        summaries = { ...summaries, [app]: result.data };
      } else {
        summaryErrors = { ...summaryErrors, [app]: result.error };
      }
    });
  }

  $effect(() => {
    for (const app of visibleApps) {
      if (presence[app.id] && !(app.id in summaries)) loadSummary(app.id);
    }
  });

  async function refresh(): Promise<void> {
    await Promise.all([loadApps(), loadPresence()]);
  }

  async function withBusy(app: string, action: () => Promise<unknown>): Promise<void> {
    if (busy[app]) return;
    busy = { ...busy, [app]: true };
    try {
      await action();
    } finally {
      busy = { ...busy, [app]: false };
    }
  }

  async function handleInstallCli(app: HostApp): Promise<void> {
    await withBusy(app.id, () => track(`Install ${app.label} CLI`, app.id, () => cairn.appsInstallCli(app.id)));
    await refresh();
  }

  async function handleInit(app: HostApp): Promise<void> {
    await withBusy(app.id, () => track("Initialize plugin-updater", app.id, () => cairn.appsInit(app.id)));
  }

  function toggleUninstallPanel(app: string): void {
    const open = !uninstallOpen[app];
    uninstallOpen = { ...uninstallOpen, [app]: open };
    if (open) uninstallWipe = { ...uninstallWipe, [app]: false };
  }

  function cancelUninstall(app: string): void {
    uninstallOpen = { ...uninstallOpen, [app]: false };
    uninstallWipe = { ...uninstallWipe, [app]: false };
  }

  async function handleUninstall(app: HostApp): Promise<void> {
    const wipe = uninstallWipe[app.id] ?? false;
    await track(`Uninstall ${app.label}`, app.id, () => cairn.appsUninstallCli(app.id, wipe));
    uninstallOpen = { ...uninstallOpen, [app.id]: false };
    uninstallWipe = { ...uninstallWipe, [app.id]: false };
    const { [app.id]: _removed, ...rest } = summaries;
    summaries = rest;
    await refresh();
  }

  onMount(() => {
    loadApps();
    loadPresence();
  });
</script>

<div class="head">
  <div>
    <h1>Apps</h1>
    <p>Install, initialize, and manage the host CLIs Cairn connects to.</p>
  </div>
</div>

{#if appsError}
  <p class="error">Could not load app status: {appsError}</p>
{/if}

{#if visibleApps.length === 0}
  <p class="loading">Loading apps…</p>
{:else}
  {#each visibleApps as app (app.id)}
    {@const present = presence[app.id] ?? false}
    {@const summary = summaries[app.id]}
    {@const summaryError = summaryErrors[app.id]}
    <section class="group" data-testid={"app-" + app.id}>
      <Card>
        <div class="row">
          <div class="info">
            <b>{app.label}</b>
            {#if present}
              <StatusPill variant="good" label="Detected" />
            {:else}
              <StatusPill variant="off" label="Not detected" />
            {/if}
          </div>
          <div class="actions">
            {#if present}
              <Button disabled={busy[app.id]} onclick={() => handleInit(app)}>Initialize plugin-updater</Button>
            {:else}
              <Button variant="primary" disabled={busy[app.id]} onclick={() => handleInstallCli(app)}>Install CLI</Button>
            {/if}
          </div>
        </div>

        {#if present}
          {#if summaryError}
            <p class="summary-error">Could not load app summary: {summaryError}</p>
          {:else if summary}
            {@const shownBreakdown = summary.providerBreakdown.slice(0, PROVIDER_BREAKDOWN_CAP)}
            {@const moreCount = summary.providerBreakdown.length - shownBreakdown.length}
            <div class="summarycard">
              <p class="summary-headline">
                {summary.accounts.length} accounts across {summary.providerCount} providers, {summary.accountsEnabled} enabled
              </p>
              {#if shownBreakdown.length > 0}
                <div class="summary-breakdown">
                  {#each shownBreakdown as agg}
                    <Chip label={`${agg.provider} · ${agg.enabled}/${agg.accounts}`} />
                  {/each}
                  {#if moreCount > 0}
                    <span class="breakdown-more">+{moreCount} more</span>
                  {/if}
                </div>
              {:else}
                <p class="summary-empty">No accounts connected.</p>
              {/if}
              {#if summary.quotaMinPct !== null}
                <p class="summary-quota">Lowest quota {summary.quotaMinPct}%</p>
              {/if}
              <div class="summary-meta">
                <span>{summary.configDir}</span>
                <span>{summary.pluginCount} plugin{summary.pluginCount === 1 ? "" : "s"}</span>
                {#if summary.routingSlots !== null}
                  <span>{summary.routingSlots} routing slot{summary.routingSlots === 1 ? "" : "s"}</span>
                {/if}
              </div>
            </div>
          {/if}
        {/if}
      </Card>

      {#if present}
        <div class="dangerzone">
          <Button variant="danger" onclick={() => toggleUninstallPanel(app.id)}>Uninstall app</Button>
          {#if uninstallOpen[app.id]}
            <div class="dangerpanel">
              <p>
                This removes the {app.label} CLI from this machine. Plugins and configuration stay in place unless
                you also delete data.
              </p>
              <label class="wipe">
                <input
                  type="checkbox"
                  checked={uninstallWipe[app.id] ?? false}
                  onchange={(event) => (uninstallWipe = { ...uninstallWipe, [app.id]: event.currentTarget.checked })}
                />
                Also delete all data
              </label>
              <div class="actions">
                <Button onclick={() => cancelUninstall(app.id)}>Cancel</Button>
                <Button variant="danger" onclick={() => handleUninstall(app)}>Uninstall</Button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </section>
  {/each}
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
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
  .group {
    margin-bottom: 26px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
  }
  .info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .info b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
  .loading {
    color: var(--faint);
    font-size: 13px;
  }
  .summarycard {
    padding: 0 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--border);
    margin-top: 14px;
    padding-top: 14px;
  }
  .summary-headline {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }
  .summary-breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .breakdown-more {
    font-size: 11.5px;
    color: var(--faint);
    padding: 4px 10px;
  }
  .summary-quota {
    margin: 0;
    font-size: 11.5px;
    color: var(--muted);
  }
  .summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 11.5px;
    color: var(--faint);
    font-family: var(--mono);
  }
  .summary-empty {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
  .summary-error {
    color: var(--crit);
    font-size: 12.5px;
    margin: 14px 18px 0;
  }
  .dangerzone {
    margin-top: 10px;
  }
  .dangerpanel {
    margin-top: 12px;
    padding: 16px 18px;
    border: 1px solid var(--crit);
    border-radius: var(--radius);
    background: var(--crit-weak);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dangerpanel p {
    margin: 0;
    font-size: 12.5px;
    color: var(--text);
  }
  .wipe {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .dangerpanel .actions {
    justify-content: flex-end;
  }
</style>
