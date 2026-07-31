<script lang="ts">
  import { onMount } from "svelte";
  import type { HostApp, AppConnection, AppSummary, ImportableApp } from "@cairn/shared";
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
  let conns = $state<Record<string, AppConnection | null>>({});
  let connError = $state("");
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

  const visibleApps = $derived(apps.filter((app) => app.id !== "cairn"));
  const selectedApp = $derived(visibleApps.find((a) => a.id === selected) ?? null);

  function setView(mode: ViewMode): void {
    view = mode;
    void saveViewMode("apps", mode);
  }

  // Fully connected means the app runs through the local API: its CLI is present
  // and, where it declares a loader, that loader is installed.
  function isConnected(c: AppConnection | null | undefined): boolean {
    if (!c) return false;
    return c.cliPresent && (c.loaderId ? c.loaderInstalled : true);
  }

  function statusLabel(c: AppConnection | null | undefined): string {
    if (isConnected(c)) return "Connected";
    if (c?.cliPresent) return "Loader not installed";
    return "Not detected";
  }

  function ctaLabel(c: AppConnection | null | undefined): string {
    if (!c?.loaderId) return "Install CLI";
    if (c.cliPresent && !c.loaderInstalled) return "Install loader";
    return "Connect";
  }

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

  async function loadConn(app: string): Promise<void> {
    const result = await cairn.appsConnection(app);
    if (result.ok) {
      conns = { ...conns, [app]: result.data };
      connError = "";
    } else {
      connError = result.error;
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

  async function withBusy(app: string, action: () => Promise<unknown>): Promise<void> {
    if (busy[app]) return;
    busy = { ...busy, [app]: true };
    try {
      await action();
    } finally {
      busy = { ...busy, [app]: false };
    }
  }

  // The loader carries app-install: connecting installs the loader, which pulls
  // in its own CLI. Apps without a loader fall back to a direct CLI install.
  async function handlePrimary(app: HostApp): Promise<void> {
    if (conns[app.id]?.loaderId) {
      await withBusy(app.id, () => track(`Connect ${app.label}`, app.id, () => cairn.appsInstallLoader(app.id)));
    } else {
      await withBusy(app.id, () => track(`Install ${app.label} CLI`, app.id, () => cairn.appsInstallCli(app.id)));
    }
    await loadConn(app.id);
  }

  async function handleUninstall(app: HostApp, wipe: boolean): Promise<void> {
    await track(`Uninstall ${app.label}`, app.id, () => cairn.appsUninstallCli(app.id, wipe));
    const { [app.id]: _removed, ...rest } = summaries;
    summaries = rest;
    selected = null;
    await loadConn(app.id);
  }

  onMount(() => {
    Promise.all([loadApps(), loadImportable()])
      .then(() => Promise.all(apps.filter((a) => a.id !== "cairn").map((a) => loadConn(a.id))))
      .finally(() => (loaded = true));
    loadViewMode("apps").then((mode) => (view = mode));
  });
</script>

<PageHeader title="Apps" subtitle="Connect the host CLIs Cairn routes through the local API." />

{#if connError}
  <p class="error">Could not load app status: {connError}</p>
{/if}

{#snippet chainNode(label: string, on: boolean)}
  <span class="node" class:on><i class="dot"></i>{label}</span>
{/snippet}

{#snippet appCard(app: HostApp)}
  {@const c = conns[app.id]}
  {@const connected = isConnected(c)}
  <div class="card" class:connected>
    <div class="cardhead">
      <PluginIcon name={app.label} icon={app.icon} size={LOGO_SIZE.list} />
      <span class="name">{app.label}</span>
      <StatusPill variant={connected ? "good" : "off"} label={statusLabel(c)} />
    </div>

    <div class="chain" aria-label="Connection chain">
      {@render chainNode("CLI", !!c?.cliPresent)}
      {#if c?.loaderId}
        <span class="link" aria-hidden="true"></span>
        {@render chainNode("Loader", !!c?.loaderInstalled)}
      {/if}
      <span class="link" aria-hidden="true"></span>
      {@render chainNode("Local API", connected)}
    </div>

    <div class="cardactions">
      {#if !connected}
        <Button variant="primary" disabled={busy[app.id]} onclick={() => handlePrimary(app)}>
          {#if busy[app.id]}<Spinner />{/if}
          {ctaLabel(c)}
        </Button>
      {/if}
      {#if c?.cliPresent}
        <Button onclick={() => open(app)}>{connected ? "Manage" : "Details"}</Button>
      {/if}
    </div>
  </div>
{/snippet}

{#if !loaded}
  <div class="skeletons">
    <Skeleton height="96px" radius="12px" />
    <Skeleton height="96px" radius="12px" />
  </div>
{:else}
  <div class="toolbar">
    <ViewToggle value={view} onChange={setView} />
  </div>

  {#if view === "grid"}
    <div class="apps-grid" data-testid="apps-grid">
      {#each visibleApps as app (app.id)}
        <div data-testid={"app-" + app.id} in:flyMotion={{ y: 6 }}>
          {@render appCard(app)}
        </div>
      {/each}
    </div>
  {:else}
    <ul class="list">
      {#each visibleApps as app (app.id)}
        <li data-testid={"app-" + app.id} in:flyMotion={{ y: 6 }}>
          {@render appCard(app)}
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
        loadConn(target);
      }
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
    gap: 10px;
  }
  .apps-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .card.connected {
    border-color: var(--border-strong);
  }
  .cardhead {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .cardhead .name {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: -.01em;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chain {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .node {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    letter-spacing: .02em;
    color: var(--faint);
  }
  .node.on {
    color: var(--text);
  }
  .node .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
    flex: none;
  }
  .node.on .dot {
    background: var(--good);
  }
  .link {
    flex: none;
    width: 16px;
    height: 1px;
    background: var(--border);
  }
  .cardactions {
    display: flex;
    gap: 8px;
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
