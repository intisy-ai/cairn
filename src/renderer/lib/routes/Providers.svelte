<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, HostApp } from "@cairn/shared";
  import StatusPill, { type StatusVariant } from "../components/StatusPill.svelte";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { navigate } from "../router.js";
  import { debounce } from "../util/debounce.js";
  import StatCard from "../components/StatCard.svelte";
  import SearchField from "../components/SearchField.svelte";
  import Chip from "../components/Chip.svelte";
  import ProviderRow from "../components/ProviderRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import ImportDialog from "../components/ImportDialog.svelte";
  import CustomEndpointsDialog from "../components/CustomEndpointsDialog.svelte";
  import CollapsibleGroup from "../components/CollapsibleGroup.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import ToggleSwitch from "../components/ToggleSwitch.svelte";
  import PluginIcon, { LOGO_SIZE } from "../components/PluginIcon.svelte";
  import ViewToggle from "../components/ViewToggle.svelte";
  import { loadViewMode, saveViewMode, type ViewMode } from "../viewMode.js";

  // API key / Local chips can return once ProviderRow carries a real connection-kind field.
  type Filter = "all" | "connected" | "oauth";

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "connected", label: "Connected" },
    { id: "oauth", label: "OAuth" },
  ];

  const VIRTUALIZE_THRESHOLD = 20;
  const PROVIDER_ROW_HEIGHT = 64;

  let rows = $state<ProviderRowData[]>([]);
  let loadError = $state("");
  let loaded = $state(false);
  let searchRaw = $state("");
  let search = $state("");
  let filter = $state<Filter>("all");
  let importNotes = $state<string[]>([]);
  let importError = $state("");
  let importApp = $state<string | null>(null);
  let importAppLabel = $state("");
  let apps = $state<HostApp[]>([]);
  let connectedOpen = $state(true);
  let availableOpen = $state(true);
  let customEndpointsOpen = $state(false);
  let view = $state<ViewMode>("list");

  function setView(mode: ViewMode): void {
    view = mode;
    void saveViewMode("providers", mode);
  }

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  function isConnected(row: ProviderRowData): boolean {
    return row.active || row.accountCount > 0;
  }

  function matchesFilter(row: ProviderRowData): boolean {
    switch (filter) {
      case "connected":
        return isConnected(row);
      case "oauth":
        return row.hasOAuth;
      default:
        return true;
    }
  }

  function matchesSearch(row: ProviderRowData): boolean {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return row.id.toLowerCase().includes(term) || row.label.toLowerCase().includes(term);
  }

  const filtered = $derived(rows.filter((row) => matchesFilter(row) && matchesSearch(row)));
  const connectedRows = $derived(filtered.filter(isConnected));
  const availableRows = $derived(filtered.filter((row) => !isConnected(row)));

  const connectedCount = $derived(rows.filter(isConnected).length);
  const accountsTotal = $derived(rows.reduce((sum, row) => sum + row.accountCount, 0));
  const oauthCount = $derived(rows.filter((row) => row.hasOAuth).length);

  async function load(): Promise<void> {
    const result = await cairn.providersList();
    if (result.ok) {
      rows = result.data;
      loadError = "";
    } else {
      loadError = result.error;
    }
    loaded = true;
  }

  function initials(label: string): string {
    return label.slice(0, 2);
  }

  function statusFor(row: ProviderRowData): { variant: StatusVariant; label: string } {
    return isConnected(row) ? { variant: "good", label: "Connected" } : { variant: "off", label: "Not connected" };
  }

  function accountLabel(row: ProviderRowData): string {
    if (row.accountCount === 0) return "No accounts";
    return `${row.accountCount} account${row.accountCount === 1 ? "" : "s"}`;
  }

  async function handleSetActive(id: string): Promise<void> {
    const result = await cairn.providersSetActive(id);
    if (!result.ok) toast.error(result.error);
    await load();
  }

  async function handleSetExposure(id: string, appId: string, on: boolean): Promise<void> {
    await cairn.providersSetExposure(id, appId, on);
    await load();
  }

  async function loadApps(): Promise<void> {
    const result = await cairn.appsList();
    if (result.ok) apps = result.data;
  }

  async function handleImport(): Promise<void> {
    importError = "";
    importNotes = [];
    const result = await cairn.importApps();
    if (!result.ok) {
      importError = result.error;
      return;
    }
    const importable = result.data.filter((a) => a.hasConfig);
    if (importable.length === 0) {
      importError = "No app config found to import.";
      return;
    }
    if (importable.length > 1) {
      navigate("apps", undefined, { redirect: true });
      return;
    }
    importApp = importable[0].app;
    importAppLabel = importable[0].label;
  }

  function handleAddProvider(): void {
    navigate("plugins", { kind: "provider" }, { redirect: true });
  }

  onMount(load);
  onMount(loadApps);
  onMount(() => {
    loadViewMode("providers").then((mode) => (view = mode));
  });
</script>

<div class="head">
  <div style="flex:1">
    <h1>Providers</h1>
    <p>Connect AI backends once, routed to all your apps alike.</p>
  </div>
  <Button onclick={handleImport}>Import</Button>
  <Button onclick={() => (customEndpointsOpen = true)}>Custom endpoints</Button>
  <Button variant="primary" onclick={handleAddProvider}>+ Add provider</Button>
</div>

{#if importError}
  <p class="error">{importError}</p>
{/if}
{#if importNotes.length > 0}
  <ul class="import-notes">
    {#each importNotes as note}<li>{note}</li>{/each}
  </ul>
{/if}

{#if loadError}
  <ErrorState message={`Could not load providers: ${loadError}`} onRetry={load} />
{:else if !loaded}
  <div class="skeletons">
    <Skeleton height="64px" radius="10px" />
    {#each Array(5) as _}
      <Skeleton height="46px" radius="10px" />
    {/each}
  </div>
{:else}
  <section class="summary">
    <StatCard label="Connected" value={String(connectedCount)} unit={`/ ${rows.length} providers`} />
    <StatCard label="Accounts" value={String(accountsTotal)} meta={`across ${connectedCount} providers`} />
    <StatCard label="Providers" value={String(rows.length)} />
    <StatCard label="OAuth" value={String(oauthCount)} meta={`${rows.length - oauthCount} API key / local`} />
  </section>

  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search providers" />
    {#each FILTERS as f (f.id)}
      <Chip label={f.label} on={filter === f.id} onclick={() => (filter = f.id)} />
    {/each}
    <span class="spacer"></span>
    <ViewToggle value={view} onChange={setView} />
  </div>

  {#if view === "grid"}
    <div class="providers-grid" data-testid="providers-grid">
      {#each filtered as item (item.id)}
        {@render providerCard(item)}
      {/each}
    </div>
  {:else}
    <CollapsibleGroup label="Connected" count={connectedRows.length} bind:open={connectedOpen}>
      {#snippet body()}
        <Card>
          {#if connectedRows.length > VIRTUALIZE_THRESHOLD}
            <VirtualList items={connectedRows} rowHeight={PROVIDER_ROW_HEIGHT}>
              {#snippet row(item)}
                {@render providerRow(item)}
              {/snippet}
            </VirtualList>
          {:else}
            {#each connectedRows as item (item.id)}
              {@render providerRow(item)}
            {/each}
          {/if}
        </Card>
      {/snippet}
    </CollapsibleGroup>

    <CollapsibleGroup label="Available" count={availableRows.length} bind:open={availableOpen}>
      {#snippet body()}
        <Card>
          {#if availableRows.length > VIRTUALIZE_THRESHOLD}
            <VirtualList items={availableRows} rowHeight={PROVIDER_ROW_HEIGHT}>
              {#snippet row(item)}
                {@render providerRow(item)}
              {/snippet}
            </VirtualList>
          {:else}
            {#each availableRows as item (item.id)}
              {@render providerRow(item)}
            {/each}
          {/if}
        </Card>
      {/snippet}
    </CollapsibleGroup>
  {/if}
{/if}

{#if importApp}
  <ImportDialog
    app={importApp}
    label={importAppLabel}
    onClose={() => (importApp = null)}
    onDone={(notes) => { importNotes = notes; load(); }}
  />
{/if}

{#if customEndpointsOpen}
  <CustomEndpointsDialog onClose={() => (customEndpointsOpen = false)} />
{/if}

{#snippet providerRow(row: ProviderRowData)}
  <ProviderRow
    avatar={initials(row.label)}
    name={row.label}
    subtitle={row.hasOAuth ? "OAuth" : "API key"}
    translator={row.translator}
    status={statusFor(row)}
    {apps}
    exposure={row.exposure}
    accountLabel={accountLabel(row)}
    enabled={row.active}
    onToggle={() => handleSetActive(row.id)}
    onToggleExposure={(appId, on) => handleSetExposure(row.id, appId, on)}
  />
{/snippet}

{#snippet providerCard(row: ProviderRowData)}
  <div class="provider-card" data-testid={"provider-" + row.id}>
    <PluginIcon name={row.label} size={LOGO_SIZE.list} />
    <div class="card-info">
      <b>{row.label}</b>
      <StatusPill variant={statusFor(row).variant} label={statusFor(row).label} />
      <span class="card-accounts">{accountLabel(row)}</span>
    </div>
    <ToggleSwitch checked={row.active} label={`${row.label} enabled`} onchange={() => handleSetActive(row.id)} />
  </div>
{/snippet}

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
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: 12px;
    margin-bottom: 22px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .spacer {
    flex: 1;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
  .import-notes {
    margin: 0 0 18px;
    padding: 0 0 0 18px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .providers-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 12px;
  }
  .provider-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .card-info b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-accounts {
    color: var(--muted);
    font-size: 11.5px;
  }
</style>
