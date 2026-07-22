<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData } from "@cairn/shared";
  import type { StatusVariant } from "../components/StatusPill.svelte";
  import { cairn } from "../ipc.js";
  import { navigate } from "../router.js";
  import StatCard from "../components/StatCard.svelte";
  import SearchField from "../components/SearchField.svelte";
  import Chip from "../components/Chip.svelte";
  import ProviderRow from "../components/ProviderRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";

  // API key / Local chips can return once ProviderRow carries a real connection-kind field.
  type Filter = "all" | "connected" | "oauth";

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "connected", label: "Connected" },
    { id: "oauth", label: "OAuth" },
  ];

  let rows = $state<ProviderRowData[]>([]);
  let loadError = $state("");
  let search = $state("");
  let filter = $state<Filter>("all");
  let importNotes = $state<string[]>([]);
  let importError = $state("");

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
    if (!search.trim()) return true;
    return row.label.toLowerCase().includes(search.trim().toLowerCase());
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
    await cairn.providersSetActive(id);
    await load();
  }

  async function handleSetExposure(id: string, app: "cc" | "oc", on: boolean): Promise<void> {
    await cairn.providersSetExposure(id, app, on);
    await load();
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
      navigate("appsPlugins");
      return;
    }
    const run = await cairn.importRun(importable[0].app);
    if (run.ok) {
      importNotes = run.data.notes;
      await load();
    } else {
      importError = run.error;
    }
  }

  function handleAddProvider(): void {
    navigate("appsPlugins");
  }

  onMount(load);
</script>

<div class="head">
  <div style="flex:1">
    <h1>Providers</h1>
    <p>Connect AI backends once, routed to Claude Code and OpenCode alike.</p>
  </div>
  <Button onclick={handleImport}>Import</Button>
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
  <p class="error">Could not load providers: {loadError}</p>
{:else}
  <section class="summary">
    <StatCard label="Connected" value={String(connectedCount)} unit={`/ ${rows.length} providers`} />
    <StatCard label="Accounts" value={String(accountsTotal)} meta={`across ${connectedCount} providers`} />
    <StatCard label="Providers" value={String(rows.length)} />
    <StatCard label="OAuth" value={String(oauthCount)} meta={`${rows.length - oauthCount} API key / local`} />
  </section>

  <div class="toolbar">
    <SearchField bind:value={search} placeholder="Search providers" />
    {#each FILTERS as f (f.id)}
      <Chip label={f.label} on={filter === f.id} onclick={() => (filter = f.id)} />
    {/each}
  </div>

  <section class="group">
    <div class="grouphead"><p class="label">Connected</p><span class="count">{connectedRows.length}</span><span class="line"></span></div>
    <Card>
      {#each connectedRows as row (row.id)}
        <ProviderRow
          avatar={initials(row.label)}
          name={row.label}
          subtitle={row.hasOAuth ? "OAuth" : "API key"}
          status={statusFor(row)}
          cc={row.exposure.cc}
          oc={row.exposure.oc}
          accountLabel={accountLabel(row)}
          enabled={row.active}
          onToggle={() => handleSetActive(row.id)}
          onToggleCc={(on) => handleSetExposure(row.id, "cc", on)}
          onToggleOc={(on) => handleSetExposure(row.id, "oc", on)}
        />
      {/each}
    </Card>
  </section>

  <section class="group">
    <div class="grouphead"><p class="label">Available</p><span class="count">{availableRows.length}</span><span class="line"></span></div>
    <Card>
      {#each availableRows as row (row.id)}
        <ProviderRow
          avatar={initials(row.label)}
          name={row.label}
          subtitle={row.hasOAuth ? "OAuth" : "API key"}
          status={statusFor(row)}
          cc={row.exposure.cc}
          oc={row.exposure.oc}
          accountLabel={accountLabel(row)}
          enabled={row.active}
          onToggle={() => handleSetActive(row.id)}
          onToggleCc={(on) => handleSetExposure(row.id, "cc", on)}
          onToggleOc={(on) => handleSetExposure(row.id, "oc", on)}
        />
      {/each}
    </Card>
  </section>
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
  .group {
    margin-bottom: 26px;
  }
  .grouphead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 10px;
  }
  .grouphead .label {
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
    margin: 0;
  }
  .grouphead .count {
    font-size: 11px;
    color: var(--faint);
    font-family: var(--mono);
  }
  .grouphead .line {
    flex: 1;
    height: 1px;
    background: var(--border);
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
</style>
