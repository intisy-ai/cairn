<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import { debounce } from "../util/debounce.js";
  import { buildUnifiedPlugins } from "../util/unifiedPlugins.js";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import AppPills from "../components/AppPills.svelte";
  import SplitButton from "../components/SplitButton.svelte";
  import AddPluginDialog from "../components/AddPluginDialog.svelte";

  const VIRTUALIZE_THRESHOLD = 20;
  const ROW_HEIGHT = 76;

  let sections = $state<HomePlugins[]>([]);
  let catalog = $state<CatalogEntry[]>([]);
  let pluginsError = $state("");

  let searchRaw = $state("");
  let search = $state("");
  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);
  $effect(() => {
    applySearch(searchRaw);
  });

  let addOpen = $state(false);
  let selections = $state<Record<string, string[]>>({});

  const homes = $derived(sections.map((s) => s.home));
  const unified = $derived(buildUnifiedPlugins(sections, catalog, homes));
  const filtered = $derived(
    unified.filter((p) => {
      const needle = search.trim().toLowerCase();
      return !needle || p.name.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle);
    }),
  );
  const addPluginHome = $derived(homes[0]?.id ?? "cairn");

  async function loadPlugins(): Promise<void> {
    const result = await cairn.pluginsList();
    if (result.ok) {
      sections = result.data;
      pluginsError = "";
    } else {
      pluginsError = result.error;
    }
  }

  async function loadCatalog(): Promise<void> {
    const result = await cairn.catalogList();
    if (result.ok) catalog = result.data.entries;
  }

  async function reload(): Promise<void> {
    await Promise.all([loadPlugins(), loadCatalog()]);
  }

  function homesById(): Record<string, PluginHome> {
    return Object.fromEntries(homes.map((h) => [h.id, h]));
  }
  function applicableHomesFor(p: UnifiedPlugin): { id: string; label: string }[] {
    const by = homesById();
    return Object.keys(p.homes).map((id) => ({ id, label: by[id]?.label ?? id }));
  }
  function installedMap(p: UnifiedPlugin): Record<string, boolean> {
    return Object.fromEntries(Object.entries(p.homes).map(([id, s]) => [id, s.installed]));
  }
  function notInstalledApplicable(p: UnifiedPlugin): string[] {
    return Object.entries(p.homes).filter(([, s]) => !s.installed).map(([id]) => id);
  }
  function installedApplicable(p: UnifiedPlugin): string[] {
    return Object.entries(p.homes).filter(([, s]) => s.installed).map(([id]) => id);
  }
  function isFullyInstalled(p: UnifiedPlugin): boolean {
    return notInstalledApplicable(p).length === 0;
  }
  function selectionFor(p: UnifiedPlugin): string[] {
    return selections[p.name] ?? notInstalledApplicable(p);
  }
  function toggleSelection(p: UnifiedPlugin, homeId: string): void {
    const current = new Set(selectionFor(p));
    if (current.has(homeId)) current.delete(homeId);
    else current.add(homeId);
    selections = { ...selections, [p.name]: [...current] };
  }

  async function addHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    await track(`Install ${p.name}`, homeId, () => cairn.pluginsInstall(homeId, p.name, p.url ?? ""));
    await reload();
  }
  async function removeHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    await cairn.pluginsUninstall(homeId, p.name);
    await reload();
  }
  async function handleInstallAll(p: UnifiedPlugin): Promise<void> {
    await cairn.pluginsInstallMany(p.name, p.url ?? "", notInstalledApplicable(p));
    await reload();
  }
  async function handleInstallSelected(p: UnifiedPlugin): Promise<void> {
    await cairn.pluginsInstallMany(p.name, p.url ?? "", selectionFor(p));
    const next = { ...selections };
    delete next[p.name];
    selections = next;
    await reload();
  }
  async function handleUpdate(p: UnifiedPlugin): Promise<void> {
    await cairn.pluginsInstallMany(p.name, p.url ?? "", installedApplicable(p));
    await reload();
  }
  async function handleRemoveEverywhere(p: UnifiedPlugin): Promise<void> {
    await cairn.pluginsRemoveEverywhere(p.name);
    await reload();
  }

  onMount(() => {
    reload();
  });
</script>

<div class="head">
  <div>
    <h1>Plugins</h1>
    <p>Every provider, proxy, and plugin across your apps, in one place.</p>
  </div>
</div>

{#if pluginsError}
  <p class="error">Could not load plugins: {pluginsError}</p>
{:else if sections.length === 0}
  <p class="loading">Loading plugins…</p>
{:else}
  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search plugins…" />
    <Button variant="primary" onclick={() => (addOpen = true)}>+ Add from URL</Button>
  </div>

  {#snippet unifiedRow(p: UnifiedPlugin)}
    {#snippet installMenu()}
      <div class="install-menu">
        {#each applicableHomesFor(p) as h (h.id)}
          <label class="menu-item">
            <input
              type="checkbox"
              checked={selectionFor(p).includes(h.id)}
              onchange={() => toggleSelection(p, h.id)}
            />
            {h.label}
          </label>
        {/each}
        <Button variant="primary" onclick={() => handleInstallSelected(p)}>Install selected</Button>
      </div>
    {/snippet}
    <div class="row" data-testid={"plugin-" + p.name}>
      <div class="info">
        <div class="name-with-chip">
          <b>{p.name}</b>
          {#if p.kind === "provider" || p.kind === "proxy"}
            <span class="chip">{p.kind}</span>
          {/if}
        </div>
        {#if p.description}<span class="desc">{p.description}</span>{/if}
      </div>
      <AppPills apps={applicableHomesFor(p)} values={installedMap(p)} onToggle={(homeId, on) => (on ? addHome(p, homeId) : removeHome(p, homeId))} />
      <div class="actions">
        {#if p.updateAvailable}
          <Button onclick={() => handleUpdate(p)}>Update</Button>
        {/if}
        {#if !isFullyInstalled(p)}
          <SplitButton label="Install" onPrimary={() => handleInstallAll(p)} menu={installMenu} />
        {/if}
        <Button onclick={() => handleRemoveEverywhere(p)}>Remove everywhere</Button>
      </div>
    </div>
  {/snippet}

  <Card>
    {#if filtered.length > VIRTUALIZE_THRESHOLD}
      <VirtualList items={filtered} rowHeight={ROW_HEIGHT}>
        {#snippet row(plugin)}
          {@render unifiedRow(plugin)}
        {/snippet}
      </VirtualList>
    {:else}
      {#each filtered as plugin (plugin.name)}
        {@render unifiedRow(plugin)}
      {/each}
    {/if}
    {#if unified.length === 0}
      <p class="empty">No plugins found.</p>
    {:else if filtered.length === 0}
      <p class="empty">No plugins match your search.</p>
    {/if}
  </Card>

  {#if addOpen}
    <AddPluginDialog home={addPluginHome} onClose={() => (addOpen = false)} onInstalled={reload} />
  {/if}
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
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 14px;
    flex-wrap: wrap;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
    border-top: 1px solid var(--border);
  }
  .row:first-child {
    border-top: 0;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name-with-chip {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .name-with-chip b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .desc {
    color: var(--muted);
    font-size: 12px;
  }
  .chip {
    font-size: 10.5px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--faint);
    background: var(--surface-2);
    padding: 2px 7px;
    border-radius: 20px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .install-menu {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .empty {
    margin: 0;
    padding: 16px 18px;
    color: var(--faint);
    font-size: 12.5px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
  .loading {
    color: var(--faint);
    font-size: 13px;
  }
</style>
