<script lang="ts">
  import { onMount } from "svelte";
  import type { HostApp, AppPresence, AppSummary, ImportableApp } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import Card from "../components/Card.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import Chip from "../components/Chip.svelte";
  import Button from "../components/Button.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ImportDialog from "../components/ImportDialog.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import PluginIcon from "../components/PluginIcon.svelte";
  import { flyMotion } from "../util/motion.js";

  const PROVIDER_BREAKDOWN_CAP = 6;

  let apps = $state<HostApp[]>([]);
  let presence = $state<AppPresence>({});
  let appsError = $state("");
  let loaded = $state(false);

  let busy = $state<Record<string, boolean>>({});
  let summaries = $state<Record<string, AppSummary | null>>({});
  let summaryErrors = $state<Record<string, string>>({});
  const summaryGen: Record<string, number> = {};

  let uninstallOpen = $state<Record<string, boolean>>({});
  let uninstallWipe = $state<Record<string, boolean>>({});

  let importable = $state<ImportableApp[]>([]);
  let importApp = $state<string | null>(null);
  let importAppLabel = $state("");
  let importNotes = $state<Record<string, string[]>>({});

  const visibleApps = $derived(apps.filter((app) => app.id !== "cairn"));

  function canImport(appId: string): boolean {
    return importable.some((a) => a.app === appId && a.hasConfig);
  }

  function openImport(app: HostApp): void {
    importApp = app.id;
    importAppLabel = app.label;
  }

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

  async function loadImportable(): Promise<void> {
    const result = await cairn.importApps();
    if (result.ok) importable = result.data;
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
    Promise.all([loadApps(), loadPresence(), loadImportable()]).finally(() => (loaded = true));
  });
</script>

<PageHeader title="Apps" subtitle="Install, initialize, and manage the host CLIs Cairn connects to." />

{#if appsError}
  <p class="error">Could not load app status: {appsError}</p>
{/if}

{#if !loaded}
  <div class="skeletons">
    <Skeleton height="150px" radius="12px" />
    <Skeleton height="150px" radius="12px" />
  </div>
{:else}
  {#each visibleApps as app (app.id)}
    {@const present = presence[app.id] ?? false}
    {@const summary = summaries[app.id]}
    {@const summaryError = summaryErrors[app.id]}
    <section class="group" data-testid={"app-" + app.id} in:flyMotion={{ y: 6 }}>
      <Card>
        <div class="row">
          <PluginIcon name={app.label} size={38} />
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
              {#if canImport(app.id)}
                <Button onclick={() => openImport(app)}>Import config</Button>
              {/if}
              <Button disabled={busy[app.id]} onclick={() => handleInit(app)}>
                {#if busy[app.id]}<Spinner />{/if}
                Initialize plugin-updater
              </Button>
            {:else}
              <Button variant="primary" disabled={busy[app.id]} onclick={() => handleInstallCli(app)}>
                {#if busy[app.id]}<Spinner />{/if}
                Install CLI
              </Button>
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
              <div class="stats">
                <div class="stat" data-testid="stat-accounts"><span class="v">{summary.accounts.length}</span><span class="k">accounts</span></div>
                <div class="stat" data-testid="stat-enabled"><span class="v">{summary.accountsEnabled}</span><span class="k">enabled</span></div>
                <div class="stat" data-testid="stat-providers"><span class="v">{summary.providerCount}</span><span class="k">providers</span></div>
                <div class="stat" data-testid="stat-plugins"><span class="v">{summary.pluginCount}</span><span class="k">plugins</span></div>
                {#if summary.routingSlots !== null}
                  <div class="stat" data-testid="stat-routing"><span class="v">{summary.routingSlots}</span><span class="k">routing slots</span></div>
                {/if}
                {#if summary.quotaMinPct !== null}
                  <div class="stat" data-testid="stat-quota"><span class="v">{summary.quotaMinPct}%</span><span class="k">lowest quota</span></div>
                {/if}
              </div>
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
              <div class="summary-meta">
                <span class="mono-path">{summary.configDir}</span>
              </div>
            </div>
          {/if}
        {/if}

        {#if importNotes[app.id]?.length}
          <ul class="importnotes">
            {#each importNotes[app.id] as note}<li>{note}</li>{/each}
          </ul>
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

{#if importApp}
  <ImportDialog
    app={importApp}
    label={importAppLabel}
    onClose={() => (importApp = null)}
    onDone={(notes) => {
      const target = importApp;
      if (target) {
        importNotes = { ...importNotes, [target]: notes };
        const { [target]: _removed, ...rest } = summaries;
        summaries = rest;
      }
      loadPresence();
    }}
  />
{/if}

<style>
  .group {
    margin-bottom: 18px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
  }
  .info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
  }
  .info b {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
  .summarycard {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-top: 1px solid var(--border);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9px;
  }
  .stat .v {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
  }
  .stat .k {
    font-size: 10.5px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
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
  .summary-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 11.5px;
    color: var(--faint);
  }
  .mono-path {
    font-family: var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
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
  .importnotes {
    margin: 0;
    padding: 12px 18px 14px 34px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
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
