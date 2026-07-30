<script lang="ts">
  import { onMount } from "svelte";
  import type { HostApp, AppPresence, AppSummary, ImportableApp } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import StatusPill from "../components/StatusPill.svelte";
  import Button from "../components/Button.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import Spinner from "../components/Spinner.svelte";
  import ImportDialog from "../components/ImportDialog.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import PluginIcon, { LOGO_SIZE } from "../components/PluginIcon.svelte";
  import AppDetail from "../components/AppDetail.svelte";
  import ViewToggle from "../components/ViewToggle.svelte";
  import { flyMotion } from "../util/motion.js";
  import { loadViewMode, saveViewMode, type ViewMode } from "../viewMode.js";

  let apps = $state<HostApp[]>([]);
  let presence = $state<AppPresence>({});
  let appsError = $state("");
  let loaded = $state(false);

  let busy = $state<Record<string, boolean>>({});
  let summaries = $state<Record<string, AppSummary | null>>({});
  let summaryErrors = $state<Record<string, string>>({});
  const summaryGen: Record<string, number> = {};

  let selected = $state<string | null>(null);

  let importable = $state<ImportableApp[]>([]);
  let importApp = $state<string | null>(null);
  let importAppLabel = $state("");

  let view = $state<ViewMode>("list");

  function setView(mode: ViewMode): void {
    view = mode;
    void saveViewMode("apps", mode);
  }

  const visibleApps = $derived(apps.filter((app) => app.id !== "cairn"));
  const selectedApp = $derived(visibleApps.find((a) => a.id === selected) ?? null);

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

  // Fetch a summary only when its detail opens, so the list scales to many apps.
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

  function open(app: HostApp): void {
    selected = app.id;
    if (!(app.id in summaries)) loadSummary(app.id);
  }

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

  async function handleUninstall(app: HostApp, wipe: boolean): Promise<void> {
    await track(`Uninstall ${app.label}`, app.id, () => cairn.appsUninstallCli(app.id, wipe));
    const { [app.id]: _removed, ...rest } = summaries;
    summaries = rest;
    selected = null;
    await refresh();
  }

  onMount(() => {
    Promise.all([loadApps(), loadPresence(), loadImportable()]).finally(() => (loaded = true));
    loadViewMode("apps").then((mode) => (view = mode));
  });
</script>

<PageHeader title="Apps" subtitle="Install and manage the host CLIs Cairn connects to." />

{#if appsError}
  <p class="error">Could not load app status: {appsError}</p>
{/if}

{#snippet appTile(app: HostApp, present: boolean)}
  {#if present}
    <button class="row open" onclick={() => open(app)}>
      <PluginIcon name={app.label} icon={app.icon} size={LOGO_SIZE.list} />
      <span class="name">{app.label}</span>
      <StatusPill variant="good" label="Detected" />
      <span class="chev" aria-hidden="true">›</span>
    </button>
  {:else}
    <div class="row">
      <PluginIcon name={app.label} icon={app.icon} size={LOGO_SIZE.list} />
      <span class="name">{app.label}</span>
      <StatusPill variant="off" label="Not detected" />
      <Button variant="primary" disabled={busy[app.id]} onclick={() => handleInstallCli(app)}>
        {#if busy[app.id]}<Spinner />{/if}
        Install CLI
      </Button>
    </div>
  {/if}
{/snippet}

{#if !loaded}
  <div class="skeletons">
    <Skeleton height="56px" radius="10px" />
    <Skeleton height="56px" radius="10px" />
  </div>
{:else}
  <div class="toolbar">
    <ViewToggle value={view} onChange={setView} />
  </div>

  {#if view === "grid"}
    <div class="apps-grid" data-testid="apps-grid">
      {#each visibleApps as app (app.id)}
        {@const present = presence[app.id] ?? false}
        <div data-testid={"app-" + app.id} in:flyMotion={{ y: 6 }}>
          {@render appTile(app, present)}
        </div>
      {/each}
    </div>
  {:else}
    <ul class="list">
      {#each visibleApps as app (app.id)}
        {@const present = presence[app.id] ?? false}
        <li data-testid={"app-" + app.id} in:flyMotion={{ y: 6 }}>
          {@render appTile(app, present)}
        </li>
      {/each}
    </ul>
  {/if}
{/if}

{#if selectedApp}
  <AppDetail
    app={selectedApp}
    summary={summaries[selectedApp.id] ?? null}
    summaryError={summaryErrors[selectedApp.id] ?? ""}
    canImport={canImport(selectedApp.id)}
    onClose={() => (selected = null)}
    onImport={() => selectedApp && openImport(selectedApp)}
    onUninstall={(wipe) => selectedApp && handleUninstall(selectedApp, wipe)}
  />
{/if}

{#if importApp}
  <ImportDialog
    app={importApp}
    label={importAppLabel}
    onClose={() => (importApp = null)}
    onDone={() => {
      const target = importApp;
      if (target) {
        const { [target]: _removed, ...rest } = summaries;
        summaries = rest;
        if (selected === target) loadSummary(target);
      }
      loadPresence();
    }}
  />
{/if}

<style>
  .toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 12px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    text-align: left;
  }
  button.row.open {
    cursor: pointer;
    font-family: var(--ui);
    color: var(--text);
  }
  button.row.open:hover {
    border-color: var(--border-strong);
  }
  button.row.open:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .name {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -.01em;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chev {
    color: var(--faint);
    font-size: 18px;
    flex: none;
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
