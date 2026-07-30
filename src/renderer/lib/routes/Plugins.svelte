<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin, Result, InstallManyResult, InstallOutcome, RepoRef, EngineView } from "@cairn/shared";
  import { classifyRepoName } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { consumeParams } from "../router.js";
  import { track } from "../downloads.js";
  import { debounce } from "../util/debounce.js";
  import { buildUnifiedPlugins, applicableHomeIds } from "../util/unifiedPlugins.js";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import AppPills from "../components/AppPills.svelte";
  import SplitButton from "../components/SplitButton.svelte";
  import AddPluginDialog from "../components/AddPluginDialog.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import PluginIcon from "../components/PluginIcon.svelte";
  import Chip from "../components/Chip.svelte";
  import PluginDetail from "../components/PluginDetail.svelte";

  const VIRTUALIZE_THRESHOLD = 20;
  const ROW_HEIGHT = 96;

  let sections = $state<HomePlugins[]>([]);
  let catalog = $state<CatalogEntry[]>([]);
  let engines = $state<EngineView[]>([]);
  let pluginsError = $state("");
  let loaded = $state(false);

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
  let selectedName = $state<string | null>(null);

  type KindFilter = "all" | "provider" | "proxy" | "plugin" | "engine";
  let kindFilter = $state<KindFilter>("all");
  let installedOnly = $state(false);

  function isInstalled(p: UnifiedPlugin): boolean {
    return Object.values(p.homes).some((h) => h.installed);
  }

  const homes = $derived(sections.map((s) => s.home));
  const unified = $derived(buildUnifiedPlugins(sections, catalog, homes));
  const engineIds = $derived(new Set(engines.map((e) => e.id)));
  const mandatoryIds = $derived(new Set(engines.filter((e) => e.mandatory).map((e) => e.id)));
  const counts = $derived({
    all: unified.length,
    provider: unified.filter((p) => p.kind === "provider").length,
    proxy: unified.filter((p) => p.kind === "proxy").length,
    plugin: unified.filter((p) => p.kind === "plugin").length,
    installed: unified.filter(isInstalled).length,
  });
  const filtered = $derived(
    unified.filter((p) => {
      if (kindFilter === "engine") {
        if (!engineIds.has(p.name)) return false;
      } else if (kindFilter !== "all" && p.kind !== kindFilter) {
        return false;
      }
      if (installedOnly && !isInstalled(p)) return false;
      const needle = search.trim().toLowerCase();
      return !needle
        || p.name.toLowerCase().includes(needle)
        || p.displayName.toLowerCase().includes(needle)
        || p.description.toLowerCase().includes(needle)
        || p.topics.some((t) => t.toLowerCase().includes(needle));
    }),
  );
  function setKind(kind: KindFilter): void {
    kindFilter = kind;
  }
  const addPluginHome = $derived(homes[0]?.id ?? "cairn");
  // Derive from the live list by name so the open detail reflects installs/removes.
  const selectedPlugin = $derived(selectedName ? unified.find((p) => p.name === selectedName) ?? null : null);

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

  async function loadEngines(): Promise<void> {
    const result = await cairn.enginesList();
    if (result.ok) engines = result.data;
  }

  async function reload(): Promise<void> {
    await Promise.all([loadPlugins(), loadCatalog(), loadEngines()]);
    loaded = true;
  }

  function homesById(): Record<string, PluginHome> {
    return Object.fromEntries(homes.map((h) => [h.id, h]));
  }
  function applicableHomesFor(p: UnifiedPlugin): { id: string; label: string; icon?: string }[] {
    const by = homesById();
    return Object.keys(p.homes).map((id) => ({ id, label: by[id]?.label ?? id, icon: by[id]?.icon }));
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

  function outcomesError(outcomes: InstallOutcome[]): string | null {
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length === 0) return null;
    return failed.map((o) => `${o.home}: ${o.error ?? "failed"}`).join("; ");
  }

  async function installManyTracked(label: string, name: string, url: string, homeIds: string[]): Promise<Result<InstallManyResult>> {
    const result = await track(label, homeIds.join(", ") || "none", () => cairn.pluginsInstallMany(name, url, homeIds), (data) =>
      outcomesError(data.outcomes),
    );
    if (!result.ok) return result;
    const error = outcomesError(result.data.outcomes);
    return error ? { ok: false, error } : result;
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
    await installManyTracked(`Install ${p.name}`, p.name, p.url ?? "", notInstalledApplicable(p));
    await reload();
  }
  async function handleInstallSelected(p: UnifiedPlugin): Promise<void> {
    await installManyTracked(`Install ${p.name}`, p.name, p.url ?? "", selectionFor(p));
    const next = { ...selections };
    delete next[p.name];
    selections = next;
    await reload();
  }
  async function handleUpdate(p: UnifiedPlugin): Promise<void> {
    await installManyTracked(`Update ${p.name}`, p.name, p.url ?? "", installedApplicable(p));
    await reload();
  }
  async function handleRemoveEverywhere(p: UnifiedPlugin): Promise<void> {
    const homeIds = installedApplicable(p);
    await track(`Remove ${p.name} everywhere`, homeIds.join(", ") || "all homes", () => cairn.pluginsRemoveEverywhere(p.name), (data) =>
      outcomesError(data.outcomes),
    );
    await reload();
  }
  async function installFromUrl(repo: RepoRef): Promise<Result<unknown>> {
    const kind = classifyRepoName(repo.repo) ?? "plugin";
    const homeIds = applicableHomeIds(kind, homes);
    return installManyTracked(`Install ${repo.repo}`, repo.repo, repo.url, homeIds);
  }

  const KIND_FILTERS: KindFilter[] = ["all", "provider", "proxy", "plugin", "engine"];

  onMount(() => {
    reload();
    const params = consumeParams();
    // A deep link (e.g. "Add provider" from the Providers screen) can preselect
    // the category filter so you land in the right context.
    if (params?.kind && (KIND_FILTERS as string[]).includes(params.kind)) setKind(params.kind as KindFilter);
    if (params?.add) addOpen = true;
  });
</script>

<PageHeader title="Plugins" subtitle="Every provider, proxy, and plugin across your apps, in one place." />

{#if pluginsError}
  <p class="error">Could not load plugins: {pluginsError}</p>
{:else if !loaded}
  <div class="skeletons">
    {#each Array(5) as _}
      <Skeleton height="46px" radius="10px" />
    {/each}
  </div>
{:else}
  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search plugins…" />
    <Button variant="primary" onclick={() => (addOpen = true)}>+ Add from URL</Button>
  </div>

  <div class="filters">
    <Chip label={`All ${counts.all}`} on={kindFilter === "all"} onclick={() => setKind("all")} />
    <Chip label={`Providers ${counts.provider}`} on={kindFilter === "provider"} onclick={() => setKind("provider")} />
    <Chip label={`Proxies ${counts.proxy}`} on={kindFilter === "proxy"} onclick={() => setKind("proxy")} />
    <Chip label={`Plugins ${counts.plugin}`} on={kindFilter === "plugin"} onclick={() => setKind("plugin")} />
    <Chip label="Engines" on={kindFilter === "engine"} onclick={() => setKind("engine")} />
    <span class="sep"></span>
    <Chip label={`Installed ${counts.installed}`} on={installedOnly} onclick={() => (installedOnly = !installedOnly)} />
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
      <button class="open" title={`View ${p.displayName}`} onclick={() => (selectedName = p.name)}>
        <PluginIcon icon={p.icon} name={p.displayName} kind={p.kind} />
        <div class="info">
          <div class="name-with-chip">
            <b>{p.displayName}</b>
            {#if p.displayName !== p.name}<span class="repo">{p.name}</span>{/if}
            {#if p.kind === "provider" || p.kind === "proxy"}
              <span class="chip">{p.kind}</span>
            {/if}
            {#if mandatoryIds.has(p.name)}
              <span class="chip" title="Mandatory engine">Locked</span>
            {/if}
          </div>
          {#if p.description}<span class="desc">{p.description}</span>{/if}
          {#if p.topics.length > 0}
            <div class="topics">
              {#each p.topics.slice(0, 4) as topic (topic)}
                <span class="topic" data-testid="topic">{topic}</span>
              {/each}
            </div>
          {/if}
        </div>
      </button>
      <AppPills
        apps={applicableHomesFor(p)}
        values={installedMap(p)}
        onToggle={mandatoryIds.has(p.name) ? undefined : (homeId, on) => (on ? addHome(p, homeId) : removeHome(p, homeId))}
      />
      <div class="actions">
        {#if p.updateAvailable}
          <Button onclick={() => handleUpdate(p)}>Update</Button>
        {/if}
        {#if !isFullyInstalled(p)}
          <SplitButton label="Install" onPrimary={() => handleInstallAll(p)} menu={installMenu} />
        {/if}
        {#if !mandatoryIds.has(p.name)}
          <Button onclick={() => handleRemoveEverywhere(p)}>Remove everywhere</Button>
        {/if}
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
    <AddPluginDialog home={addPluginHome} install={installFromUrl} onClose={() => (addOpen = false)} onInstalled={reload} />
  {/if}

  {#if selectedPlugin}
    <PluginDetail
      plugin={selectedPlugin}
      homes={applicableHomesFor(selectedPlugin)}
      onClose={() => (selectedName = null)}
      onInstallAll={() => handleInstallAll(selectedPlugin)}
      onRemoveEverywhere={() => handleRemoveEverywhere(selectedPlugin)}
      onUpdate={() => handleUpdate(selectedPlugin)}
      onToggleHome={(homeId, on) => (on ? addHome(selectedPlugin, homeId) : removeHome(selectedPlugin, homeId))}
    />
  {/if}
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 12px;
    flex-wrap: wrap;
  }
  .filters {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 2px 14px;
    flex-wrap: wrap;
  }
  .filters .sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 3px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    border-top: 1px solid var(--border);
  }
  .row:first-child {
    border-top: 0;
  }
  .open {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;
    min-width: 0;
    background: none;
    border: 0;
    padding: 6px;
    margin: -6px;
    border-radius: 10px;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .open:hover {
    background: var(--surface-2);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
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
  .repo {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--faint);
  }
  .desc {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
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
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 4px;
  }
  .topic {
    font-size: 10px;
    color: var(--faint);
    background: var(--surface-2);
    padding: 1px 7px;
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
</style>
