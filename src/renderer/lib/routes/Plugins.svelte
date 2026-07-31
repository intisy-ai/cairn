<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin, PluginVersion, Result, InstallManyResult, InstallOutcome, RepoRef, EngineView } from "@cairn/shared";
  import { classifyRepoName } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { consumeParams } from "../router.js";
  import { enqueue, activeByKey, type DownloadSource } from "../downloads.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import { buildUnifiedPlugins, applicableHomeIds } from "../util/unifiedPlugins.js";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import AppPills from "../components/AppPills.svelte";
  import PluginInstallControl from "../components/PluginInstallControl.svelte";
  import AddPluginDialog from "../components/AddPluginDialog.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import PluginIcon, { LOGO_SIZE } from "../components/PluginIcon.svelte";
  import GitHubConnection from "../components/GitHubConnection.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import Chip from "../components/Chip.svelte";
  import PluginDetail from "../components/PluginDetail.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import ViewToggle from "../components/ViewToggle.svelte";
  import { loadViewMode, saveViewMode, type ViewMode } from "../viewMode.js";

  const VIRTUALIZE_THRESHOLD = 20;
  const ROW_HEIGHT = 96;

  let sections = $state<HomePlugins[]>([]);
  let catalog = $state<CatalogEntry[]>([]);
  let catalogOrg = $state("");
  let engines = $state<EngineView[]>([]);
  let versions = $state<Record<string, Record<string, PluginVersion>>>({});
  let pluginsError = $state("");
  let loaded = $state(false);

  function versionLabelFor(p: UnifiedPlugin): string {
    return Object.values(versions[p.name] ?? {}).map((v) => v.label).find((l): l is string => !!l) ?? "";
  }

  let searchRaw = $state("");
  let search = $state("");
  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);
  $effect(() => {
    applySearch(searchRaw);
  });

  const startParams = consumeParams();
  let addOpen = $state(!!startParams?.add);
  let selectedName = $state<string | null>(null);
  let pendingConfirm = $state<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);

  type KindFilter = "all" | "provider" | "proxy" | "plugin" | "loader" | "engine";
  const KIND_FILTERS: KindFilter[] = ["all", "provider", "proxy", "plugin", "loader", "engine"];
  const startKind: KindFilter =
    startParams?.kind && (KIND_FILTERS as string[]).includes(startParams.kind) ? (startParams.kind as KindFilter) : "plugin";
  let kindFilter = $state<KindFilter>(startKind);
  let installedOnly = $state(false);
  let externalOnly = $state(false);

  // A plugin can be external and a kind at once, so the badge prefixes its kind
  // (the .chip style upper-cases it), e.g. "external provider" -> "EXTERNAL PROVIDER".
  function badgeLabel(p: UnifiedPlugin): string {
    const kind = p.kind === "provider" || p.kind === "proxy" || p.kind === "loader" ? p.kind : "";
    if (p.external) return kind ? `external ${kind}` : "external";
    return kind;
  }

  let view = $state<ViewMode>("list");
  function setView(mode: ViewMode): void {
    view = mode;
    void saveViewMode("plugins", mode);
  }

  function isInstalled(p: UnifiedPlugin): boolean {
    return Object.values(p.homes).some((h) => h.installed);
  }

  const homes = $derived(sections.map((s) => s.home));
  const engineIds = $derived(new Set(engines.map((e) => e.id)));
  const unified = $derived(buildUnifiedPlugins(sections, catalog, homes, engines.map((e) => ({ name: e.id, url: e.url })), catalogOrg));
  const counts = $derived({
    all: unified.length,
    provider: unified.filter((p) => p.kind === "provider").length,
    proxy: unified.filter((p) => p.kind === "proxy").length,
    plugin: unified.filter((p) => p.kind === "plugin").length,
    loader: unified.filter((p) => p.kind === "loader").length,
    engine: unified.filter((p) => engineIds.has(p.name)).length,
    installed: unified.filter(isInstalled).length,
    external: unified.filter((p) => p.external).length,
  });
  const filtered = $derived(
    unified.filter((p) => {
      if (kindFilter === "engine") {
        if (!engineIds.has(p.name)) return false;
      } else if (kindFilter !== "all" && p.kind !== kindFilter) {
        return false;
      }
      if (installedOnly && !isInstalled(p)) return false;
      if (externalOnly && !p.external) return false;
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
  const isFiltering = $derived(search.trim() !== "" || kindFilter !== "all" || installedOnly || externalOnly);
  function clearFilters(): void {
    searchRaw = "";
    search = "";
    kindFilter = "all";
    installedOnly = false;
    externalOnly = false;
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
    if (result.ok) {
      catalog = result.data.entries;
      catalogOrg = result.data.org;
    }
  }

  async function loadEngines(): Promise<void> {
    const result = await cairn.enginesList();
    if (result.ok) engines = result.data;
  }

  // Show cached versions instantly, then overwrite with the freshly computed ones
  // (a git describe per plugin) so only rows whose version changed visibly update.
  // The fresh pass runs in parallel; the cache only fills in until it arrives.
  async function loadVersions(): Promise<void> {
    let freshDone = false;
    const fresh = cairn.pluginVersionsAll().then((result) => {
      freshDone = true;
      if (result.ok) versions = result.data;
    });
    const cached = await cairn.pluginVersionsCached();
    if (!freshDone && cached.ok && Object.keys(cached.data).length > 0) versions = cached.data;
    await fresh;
  }

  async function reload(): Promise<void> {
    await Promise.all([loadPlugins(), loadCatalog(), loadEngines()]);
    loaded = true;
    void loadVersions();
  }

  function homesById(): Record<string, PluginHome> {
    return Object.fromEntries(homes.map((h) => [h.id, h]));
  }
  // A home takes a non-engine plugin only once plugin-updater manages it there;
  // engines bootstrap directly and Cairn's own home is always manageable.
  function canInstallInto(p: UnifiedPlugin, homeId: string): boolean {
    return engineIds.has(p.name) || !!homesById()[homeId]?.hasUpdater;
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
  function outcomesError(outcomes: InstallOutcome[]): string | null {
    const failed = outcomes.filter((o) => !o.ok);
    if (failed.length === 0) return null;
    return failed.map((o) => `${o.home}: ${o.error ?? "failed"}`).join("; ");
  }

  // Cairn only downloads directly to bootstrap an engine into an app home that has
  // no plugin-updater yet; every other install is handled by plugin-updater.
  function sourceFor(name: string, homeIds: string[]): DownloadSource {
    const by = homesById();
    const allBootstrap = homeIds.length > 0
      && homeIds.every((id) => engineIds.has(name) && !by[id]?.hasUpdater);
    return allBootstrap ? "cairn" : "plugin-updater";
  }
  function homesLabel(homeIds: string[]): string {
    const by = homesById();
    return homeIds.map((id) => by[id]?.label ?? id).join(", ") || "none";
  }

  async function installManyTracked(label: string, name: string, url: string, homeIds: string[]): Promise<Result<InstallManyResult>> {
    const result = await enqueue({
      label,
      home: homesLabel(homeIds),
      source: sourceFor(name, homeIds),
      key: name,
      run: (id) => cairn.pluginsInstallMany(name, url, homeIds, id),
      summarizeFailure: (data) => outcomesError(data.outcomes),
    });
    if (!result.ok) return result;
    const error = outcomesError(result.data.outcomes);
    return error ? { ok: false, error } : result;
  }

  async function addHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    await enqueue({
      label: `Install ${p.displayName}`,
      home: homesLabel([homeId]),
      source: sourceFor(p.name, [homeId]),
      key: p.name,
      run: (id) => cairn.pluginsInstall(homeId, p.name, p.url ?? "", id),
    });
    await reload();
  }
  // A per-home update is a re-clone/pull through the same install path, routed
  // through the download queue so it shows progress like every other download.
  async function updateHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    await enqueue({
      label: `Update ${p.displayName}`,
      home: homesLabel([homeId]),
      source: sourceFor(p.name, [homeId]),
      key: p.name,
      run: (id) => cairn.pluginsInstall(homeId, p.name, p.url ?? "", id),
    });
    await reload();
  }
  async function removeHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    await cairn.pluginsUninstall(homeId, p.name);
    await reload();
  }
  // Install/update home-by-home (each its own queued task) and reload after each,
  // so a plugin's pills and button reflect every home as soon as it finishes
  // rather than waiting for the whole multi-home batch to complete.
  async function handleInstallAll(p: UnifiedPlugin): Promise<void> {
    const targets = notInstalledApplicable(p).filter((id) => canInstallInto(p, id));
    for (const homeId of targets) await addHome(p, homeId);
  }
  async function handleUpdate(p: UnifiedPlugin): Promise<void> {
    for (const homeId of installedApplicable(p)) await updateHome(p, homeId);
  }
  async function handleRemoveEverywhere(p: UnifiedPlugin): Promise<void> {
    const homeIds = installedApplicable(p);
    const result = await enqueue({
      label: `Remove ${p.displayName} everywhere`,
      home: homesLabel(homeIds) || "all homes",
      source: sourceFor(p.name, homeIds),
      key: p.name,
      run: () => cairn.pluginsRemoveEverywhere(p.name),
      summarizeFailure: (data) => outcomesError(data.outcomes),
    });
    if (result.ok) toast.success(`${p.displayName} removed`);
    else toast.error(result.error);
    await reload();
  }
  function confirmRemoveEverywhere(p: UnifiedPlugin): void {
    pendingConfirm = {
      title: "Remove everywhere?",
      message: `Remove ${p.displayName} from every app it's installed in? This can't be undone.`,
      confirmLabel: "Remove everywhere",
      run: () => handleRemoveEverywhere(p),
    };
  }
  async function installFromUrl(repo: RepoRef): Promise<Result<unknown>> {
    const kind = classifyRepoName(repo.repo) ?? "plugin";
    const homeIds = applicableHomeIds(kind, homes);
    return installManyTracked(`Install ${repo.repo}`, repo.repo, repo.url, homeIds);
  }

  onMount(() => {
    reload();
    loadViewMode("plugins").then((mode) => (view = mode));
  });
</script>

<PageHeader title="Plugins" subtitle="Every provider, proxy, and plugin across your apps, in one place." />

{#if pluginsError}
  <ErrorState message={`Could not load plugins: ${pluginsError}`} onRetry={reload} />
{:else if !loaded}
  <div class="skeletons">
    {#each Array(5) as _}
      <Skeleton height="46px" radius="10px" />
    {/each}
  </div>
{:else}
  <GitHubConnection onChanged={loadCatalog} />

  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search plugins…" />
    <Button variant="primary" onclick={() => (addOpen = true)}>+ Add from URL</Button>
    <ViewToggle value={view} onChange={setView} />
  </div>

  <div class="filters">
    <Chip label={`All ${counts.all}`} on={kindFilter === "all"} onclick={() => setKind("all")} />
    <Chip label={`Providers ${counts.provider}`} on={kindFilter === "provider"} onclick={() => setKind("provider")} />
    <Chip label={`Proxies ${counts.proxy}`} on={kindFilter === "proxy"} onclick={() => setKind("proxy")} />
    <Chip label={`Plugins ${counts.plugin}`} on={kindFilter === "plugin"} onclick={() => setKind("plugin")} />
    <Chip label={`Loaders ${counts.loader}`} on={kindFilter === "loader"} onclick={() => setKind("loader")} />
    <Chip label={`Engines ${counts.engine}`} on={kindFilter === "engine"} onclick={() => setKind("engine")} />
    <span class="sep"></span>
    <Chip label={`Installed ${counts.installed}`} on={installedOnly} onclick={() => (installedOnly = !installedOnly)} />
    <Chip label={`External ${counts.external}`} on={externalOnly} onclick={() => (externalOnly = !externalOnly)} />
  </div>

  {#snippet installActions(p: UnifiedPlugin)}
    <div class="actions">
      {#if p.updateAvailable}
        <Button onclick={() => handleUpdate(p)}>Update</Button>
      {/if}
      <div class="ctlw">
        <PluginInstallControl
          block
          plugin={p}
          homes={applicableHomesFor(p)}
          canInstallHome={(homeId) => canInstallInto(p, homeId)}
          activity={$activeByKey[p.name] ?? null}
          onInstallAll={() => handleInstallAll(p)}
          onRemoveEverywhere={() => confirmRemoveEverywhere(p)}
          onToggleHome={(homeId, on) => (on ? addHome(p, homeId) : removeHome(p, homeId))}
        />
      </div>
    </div>
  {/snippet}

  {#snippet unifiedRow(p: UnifiedPlugin)}
    <div class="row" data-testid={"plugin-" + p.name}>
      <button class="open" title={`View ${p.displayName}`} onclick={() => (selectedName = p.name)}>
        <PluginIcon icon={p.icon} name={p.displayName} kind={p.kind} />
        <div class="info">
          <div class="name-with-chip">
            <b>{p.displayName}</b>
            {#if p.displayName !== p.name}<span class="repo">{p.name}</span>{/if}
            {#if versionLabelFor(p)}<span class="ver">{versionLabelFor(p)}</span>{/if}
            {#if badgeLabel(p)}
              <span class="chip" title={p.external ? "Installed from a repo outside the marketplace org" : undefined}>{badgeLabel(p)}</span>
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
        canInstall={(homeId) => canInstallInto(p, homeId)}
        onToggle={(homeId, on) => (on ? addHome(p, homeId) : removeHome(p, homeId))}
      />
      {@render installActions(p)}
    </div>
  {/snippet}

  {#snippet pluginCard(p: UnifiedPlugin)}
    <div class="plugin-card" data-testid={"plugin-" + p.name}>
      <button class="card-open" title={`View ${p.displayName}`} onclick={() => (selectedName = p.name)}>
        <PluginIcon icon={p.icon} name={p.displayName} kind={p.kind} size={LOGO_SIZE.list} />
        <div class="card-title">
          <b>{p.displayName}</b>
          {#if versionLabelFor(p)}<span class="ver">{versionLabelFor(p)}</span>{/if}
          {#if badgeLabel(p)}
            <span class="chip" title={p.external ? "Installed from a repo outside the marketplace org" : undefined}>{badgeLabel(p)}</span>
          {/if}
        </div>
        {#if p.description}<span class="card-desc">{p.description}</span>{/if}
      </button>
      <div class="card-footer">
        {@render installActions(p)}
      </div>
    </div>
  {/snippet}

  {#snippet emptyState()}
    {#if unified.length === 0}
      <EmptyState message="No plugins found." />
    {:else if filtered.length === 0 && isFiltering}
      <EmptyState message="No plugins match your filters." actionLabel="Clear filters" onAction={clearFilters} />
    {/if}
  {/snippet}

  {#if view === "grid"}
    <div class="plugins-grid" data-testid="plugins-grid">
      {#each filtered as plugin (plugin.name)}
        {@render pluginCard(plugin)}
      {/each}
    </div>
    {@render emptyState()}
  {:else}
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
      {@render emptyState()}
    </Card>
  {/if}

  {#if addOpen}
    <AddPluginDialog home={addPluginHome} install={installFromUrl} onClose={() => (addOpen = false)} onInstalled={reload} />
  {/if}

  {#if selectedPlugin}
    <PluginDetail
      plugin={selectedPlugin}
      homes={applicableHomesFor(selectedPlugin)}
      canInstallHome={(homeId) => canInstallInto(selectedPlugin, homeId)}
      activity={$activeByKey[selectedPlugin.name] ?? null}
      onClose={() => (selectedName = null)}
      onInstallAll={() => handleInstallAll(selectedPlugin)}
      onRemoveEverywhere={() => confirmRemoveEverywhere(selectedPlugin)}
      onUpdate={() => handleUpdate(selectedPlugin)}
      onUpdateHome={(homeId) => updateHome(selectedPlugin, homeId)}
      onToggleHome={(homeId, on) => (on ? addHome(selectedPlugin, homeId) : removeHome(selectedPlugin, homeId))}
      onChanged={reload}
    />
  {/if}

  {#if pendingConfirm}
    <ConfirmDialog
      title={pendingConfirm.title}
      message={pendingConfirm.message}
      confirmLabel={pendingConfirm.confirmLabel}
      danger
      onConfirm={async () => { const p = pendingConfirm; pendingConfirm = null; if (!p) return; await p.run(); }}
      onCancel={() => (pendingConfirm = null)}
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
  .plugins-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 12px;
  }
  .plugin-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .card-open {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    background: none;
    border: 0;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
    width: 100%;
  }
  .card-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .card-title b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .card-desc {
    color: var(--muted);
    font-size: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-footer {
    display: flex;
    justify-content: flex-end;
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
  .ver {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--accent);
    background: var(--accent-weak);
    border-radius: 5px;
    padding: 1px 6px;
    flex: none;
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
  .ctlw {
    width: 172px;
    flex: none;
  }
</style>
