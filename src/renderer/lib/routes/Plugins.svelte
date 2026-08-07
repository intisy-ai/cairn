<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, CatalogEntry, PluginHome, UnifiedPlugin, PluginVersion, Result, InstallManyResult, InstallOutcome, RepoRef, EngineView, GithubStatus } from "@cairn/shared";
  import { classifyRepoName } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { consumeParams } from "../router.js";
  import { enqueue, enqueueJob, jobSettled, activeByPlugin } from "../downloads.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import { buildUnifiedPlugins, applicableHomeIds } from "../util/unifiedPlugins.js";
  import { prerequisiteInstalls } from "../util/installQueue.js";
  import Button from "../components/Button.svelte";
  import IconButton from "../components/IconButton.svelte";
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
  import ErrorState from "../components/ErrorState.svelte";
  import Chip from "../components/Chip.svelte";
  import PluginDetail from "../components/PluginDetail.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import ViewToggle from "../components/ViewToggle.svelte";
  import GitHubConnectDialog from "../components/GitHubConnectDialog.svelte";
  import { loadViewMode, saveViewMode, type ViewMode } from "../viewMode.js";
  import { githubChanged, bumpGithub } from "../githubStore.js";

  const VIRTUALIZE_THRESHOLD = 20;
  const ROW_HEIGHT = 96;

  let sections = $state<HomePlugins[]>([]);
  let catalog = $state<CatalogEntry[]>([]);
  let catalogOrg = $state("");
  let engines = $state<EngineView[]>([]);
  let versions = $state<Record<string, Record<string, PluginVersion>>>({});
  let favorites = $state<string[]>([]);
  let pluginsError = $state("");
  let loaded = $state(false);
  let catalogRateLimited = $state(false);
  let ghStatus = $state<GithubStatus | null>(null);
  let rateLimitBannerDismissed = $state(false);
  let connectDialogOpen = $state(false);
  // A plugin awaiting a real GitHub star once the user connects an account.
  let pendingStarPlugin = $state<UnifiedPlugin | null>(null);

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
  // Arriving with ?plugin= opens that plugin straight away, so a link from another screen
  // lands on the plugin itself rather than just the list.
  let selectedName = $state<string | null>(startParams?.plugin ?? null);
  let pendingConfirm = $state<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);

  type KindFilter = "all" | "provider" | "proxy" | "plugin" | "loader" | "engine";
  const KIND_FILTERS: KindFilter[] = ["all", "provider", "proxy", "plugin", "loader", "engine"];
  const startKind: KindFilter =
    startParams?.kind && (KIND_FILTERS as string[]).includes(startParams.kind) ? (startParams.kind as KindFilter) : "plugin";
  let kindFilter = $state<KindFilter>(startKind);
  let installedOnly = $state(false);
  let externalOnly = $state(false);
  let favoritesOnly = $state(false);
  let updatableOnly = $state(false);
  // Archived repos stay installable, they are just not what you are usually shopping for.
  // Off by default, and remembered, so asking for them once is enough.
  let showDeprecated = $state(false);

  // A plugin can be external and a kind at once, so the badge prefixes its kind
  // (the .chip style upper-cases it), e.g. "external provider" -> "EXTERNAL PROVIDER".
  function badgeLabel(p: UnifiedPlugin): string {
    const kind = p.kind === "provider" || p.kind === "proxy" || p.kind === "loader" ? p.kind : "";
    if (p.deprecated) return kind ? `deprecated ${kind}` : "deprecated";
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
  const unified = $derived(buildUnifiedPlugins(sections, catalog, homes, engines.map((e) => ({ name: e.id, url: e.url })), catalogOrg, favorites));
  const counts = $derived({
    all: unified.length,
    provider: unified.filter((p) => p.kind === "provider").length,
    proxy: unified.filter((p) => p.kind === "proxy").length,
    plugin: unified.filter((p) => p.kind === "plugin").length,
    loader: unified.filter((p) => p.kind === "loader").length,
    engine: unified.filter((p) => engineIds.has(p.name)).length,
    installed: unified.filter(isInstalled).length,
    external: unified.filter((p) => p.external).length,
    favorite: unified.filter((p) => p.favorite).length,
    updatable: unified.filter((p) => behindHomesFor(p).length > 0).length,
    deprecated: unified.filter((p) => p.deprecated).length,
  });
  const filtered = $derived(
    unified.filter((p) => {
      if (kindFilter === "engine") {
        if (!engineIds.has(p.name)) return false;
      } else if (kindFilter !== "all" && p.kind !== kindFilter) {
        return false;
      }
      // An installed one stays listed whatever the filter says, otherwise asking to hide
      // deprecated entries would hide something already on disk and leave no way to remove it.
      if (p.deprecated && !showDeprecated && !isInstalled(p)) return false;
      if (installedOnly && !isInstalled(p)) return false;
      if (externalOnly && !p.external) return false;
      if (favoritesOnly && !p.favorite) return false;
      if (updatableOnly && behindHomesFor(p).length === 0) return false;
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
  const isFiltering = $derived(search.trim() !== "" || kindFilter !== "all" || installedOnly || externalOnly || favoritesOnly || updatableOnly);
  function clearFilters(): void {
    searchRaw = "";
    search = "";
    kindFilter = "all";
    installedOnly = false;
    externalOnly = false;
    favoritesOnly = false;
    updatableOnly = false;
  }
  const addPluginHome = $derived(homes[0]?.id ?? "cairn");
  // Only counts what an updater could actually pull, so the button never promises a
  // no-op for a plugin sitting behind in an unmanaged home.
  const anyUpdateAvailable = $derived(unified.some((p) => behindHomesFor(p).length > 0));
  // Derive from the live list by name so the open detail reflects installs/removes.
  const selectedPlugin = $derived(selectedName ? unified.find((p) => p.name === selectedName) ?? null : null);
  const showRateLimitBanner = $derived(catalogRateLimited && !!ghStatus && !ghStatus.connected && !rateLimitBannerDismissed);

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
      catalogRateLimited = result.data.rateLimited;
    }
  }

  async function loadGithubStatus(): Promise<void> {
    const result = await cairn.githubStatus();
    if (result.ok) ghStatus = result.data;
  }

  async function loadEngines(): Promise<void> {
    const result = await cairn.enginesList();
    if (result.ok) engines = result.data;
  }

  async function loadFavorites(): Promise<void> {
    const result = await cairn.favoritesList();
    if (result.ok) favorites = result.data;
  }

  // Starring is a real GitHub star, so require a connected account before adding
  // one rather than leaving a local-only favorite that never reaches GitHub.
  // Removing a favorite stays purely local and needs no account.
  async function toggleFavorite(p: UnifiedPlugin): Promise<void> {
    if (!p.favorite && !ghStatus?.connected) {
      pendingStarPlugin = p;
      connectDialogOpen = true;
      return;
    }
    await applyFavorite(p);
  }

  // Local favorite is instant and authoritative; the GitHub star is a best-effort
  // mirror fired off afterward and never blocks or reverts the local toggle.
  async function applyFavorite(p: UnifiedPlugin): Promise<void> {
    const result = await cairn.favoritesToggle(p.name);
    if (!result.ok) return;
    favorites = result.data;
    if (p.url) void cairn.githubSetStar(p.url, result.data.includes(p.name));
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

  // The cached list is whatever the last real read produced, so the screen has rows to draw
  // before anything is read again. It is only a head start: the live read replaces it, and a
  // cache miss just leaves the skeleton up as before.
  async function paintFromCache(): Promise<void> {
    if (sections.length > 0) return;
    const result = await cairn.pluginsListCached();
    if (result.ok && result.data.length > 0 && sections.length === 0) {
      sections = result.data;
      loaded = true;
    }
  }

  async function reload(): Promise<void> {
    void paintFromCache();
    await Promise.all([loadPlugins(), loadCatalog(), loadEngines(), loadFavorites(), loadGithubStatus()]);
    queuedManagerHomes = new Set();
    loaded = true;
    void loadVersions();
  }

  // One-click connect from the rate-limit banner: reuses the detected gh CLI
  // token when present, otherwise opens the same "add account" dialog used
  // elsewhere. Either path reloads the catalog + status and notifies the rest
  // of the app so the titlebar's GitHub menu picks up the new account too.
  async function connectFromBanner(): Promise<void> {
    if (!ghStatus?.ghCli) {
      connectDialogOpen = true;
      return;
    }
    const result = await cairn.githubConnectGhCli(false);
    if (result.ok) await finishBannerConnect();
  }

  async function finishBannerConnect(): Promise<void> {
    connectDialogOpen = false;
    await Promise.all([loadCatalog(), loadGithubStatus()]);
    bumpGithub();
    const pending = pendingStarPlugin;
    pendingStarPlugin = null;
    if (pending && ghStatus?.connected) await applyFavorite(pending);
  }

  function dismissRateLimitBanner(): void {
    rateLimitBannerDismissed = true;
  }

  function homesById(): Record<string, PluginHome> {
    return Object.fromEntries(homes.map((h) => [h.id, h]));
  }
  function applicableHomesFor(p: UnifiedPlugin): { id: string; label: string; icon?: string; hasUpdater?: boolean }[] {
    const by = homesById();
    return Object.keys(p.homes).map((id) => ({ id, label: by[id]?.label ?? id, icon: by[id]?.icon, hasUpdater: by[id]?.hasUpdater }));
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

  // Homes where this plugin is installed but only partly built, so it loads with pieces of
  // itself missing. A rebuild from the clone already on disk is what fixes that.
  function brokenHomesFor(p: UnifiedPlugin): string[] {
    return sections
      .filter((s) => s.rows.some((r) => r.name === p.name && (r.missingArtifacts?.length ?? 0) > 0))
      .map((s) => s.home.id);
  }

  // Which homes report this plugin as behind, from each home's own row.
  function behindHomesFor(p: UnifiedPlugin): string[] {
    return sections
      .filter((s) => s.home.hasUpdater && s.rows.some((r) => r.name === p.name && r.updateAvailable))
      .map((s) => s.home.id);
  }

  function homesLabel(homeIds: string[]): string {
    const by = homesById();
    return homeIds.map((id) => by[id]?.label ?? id).join(", ") || "none";
  }

  // A home whose manager install is already queued must not get a second row when the
  // user starts another install before the list reloads.
  let queuedManagerHomes = new Set<string>();

  async function installPrerequisites(name: string, homeIds: string[]): Promise<boolean> {
    for (const prereq of prerequisiteInstalls(name, homeIds, homes, engines)) {
      if (queuedManagerHomes.has(prereq.homeId)) continue;
      queuedManagerHomes.add(prereq.homeId);
      const queued = await enqueueJob("install", prereq.id, prereq.url, prereq.homeId);
      if (!queued.ok) {
        queuedManagerHomes.delete(prereq.homeId);
        return false;
      }
      // The manager has to be there before the plugin's own job runs, so this one is awaited.
      const settled = await jobSettled(queued.data.id);
      if (settled?.status !== "done") {
        queuedManagerHomes.delete(prereq.homeId);
        return false;
      }
    }
    return true;
  }

  async function installManyTracked(name: string, url: string, homeIds: string[]): Promise<Result<InstallManyResult>> {
    if (!(await installPrerequisites(name, homeIds))) {
      return { ok: false, error: "could not install the plugin manager" };
    }
    // One job per home, so each home shows its own progress and can be cancelled alone.
    const outcomes: InstallOutcome[] = [];
    for (const homeId of homeIds) {
      const queued = await enqueueJob("install", name, url, homeId);
      outcomes.push(queued.ok ? { home: homeId, ok: true } : { home: homeId, ok: false, error: queued.error });
    }
    const error = outcomesError(outcomes);
    return error ? { ok: false, error } : { ok: true, data: { outcomes } };
  }

  async function addHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    if (!(await installPrerequisites(p.name, [homeId]))) {
      await reload();
      return;
    }
    const queued = await enqueueJob("install", p.name, p.url ?? "", homeId);
    if (queued.ok) await jobSettled(queued.data.id);
    await reload();
  }
  // A per-home update is a re-clone/pull through the same install path, routed
  // through the download queue so it shows progress like every other download.
  async function updateHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    const queued = await enqueueJob("update", p.name, p.url ?? "", homeId);
    if (queued.ok) await jobSettled(queued.data.id);
    await reload();
  }
  // A repair rebuilds from the clone that is already there, so it goes through the same
  // queue as an install and shows the same progress.
  async function repairHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    const queued = await enqueueJob("repair", p.name, p.url ?? "", homeId);
    if (queued.ok) await jobSettled(queued.data.id);
    await reload();
  }
  // Through the same queue as an install, so a removal shows its progress, can be cancelled,
  // and lands in the download history instead of happening invisibly.
  async function removeHome(p: UnifiedPlugin, homeId: string): Promise<void> {
    const queued = await enqueueJob("remove", p.name, p.url ?? "", homeId);
    if (queued.ok) await jobSettled(queued.data.id);
    else await cairn.pluginsUninstall(homeId, p.name);
    await reload();
  }
  // Install/update home-by-home (each its own queued task) and reload after each,
  // so a plugin's pills and button reflect every home as soon as it finishes
  // rather than waiting for the whole multi-home batch to complete.
  // Every home is queued up front so each row shows "queued" straight away; awaiting one
  // home before queueing the next left the later rows looking untouched.
  async function handleInstallAll(p: UnifiedPlugin): Promise<void> {
    const homeIds = notInstalledApplicable(p);
    if (!(await installPrerequisites(p.name, homeIds))) {
      await reload();
      return;
    }
    const ids: string[] = [];
    for (const homeId of homeIds) {
      const queued = await enqueueJob("install", p.name, p.url ?? "", homeId);
      if (queued.ok) ids.push(queued.data.id);
    }
    await reload();
    await Promise.all(ids.map((id) => jobSettled(id)));
    await reload();
  }

  let checking = $state(false);
  let updatingAll = $state(false);

  // Only a home with an updater can check or pull, so nothing here is offered without one.
  const updatesEnabled = $derived(homes.some((h) => h.hasUpdater));
  function updatableHomes(): PluginHome[] {
    return homes.filter((h) => h.hasUpdater && (h.id === "cairn" || h.present));
  }

  // A check refreshes the update cache every badge is read from, so the rows are
  // reloaded straight after.
  async function handleCheckUpdates(): Promise<void> {
    if (checking) return;
    checking = true;
    try {
      for (const home of updatableHomes()) await cairn.updatesCheck(home.id);
      await loadPlugins();
    } finally {
      checking = false;
    }
  }

  async function handleUpdateAll(): Promise<void> {
    if (updatingAll) return;
    updatingAll = true;
    try {
      for (const home of updatableHomes()) await cairn.updatesAll(home.id);
      await loadPlugins();
    } finally {
      updatingAll = false;
    }
  }

  async function handleUpdate(p: UnifiedPlugin): Promise<void> {
    const ids: string[] = [];
    for (const homeId of installedApplicable(p)) {
      const queued = await enqueueJob("update", p.name, p.url ?? "", homeId);
      if (queued.ok) ids.push(queued.data.id);
    }
    await reload();
    await Promise.all(ids.map((id) => jobSettled(id)));
    await reload();
  }
  async function handleRemoveEverywhere(p: UnifiedPlugin): Promise<void> {
    const homeIds = installedApplicable(p);
    const result = await enqueue({
      label: `Remove ${p.displayName} everywhere`,
      home: homesLabel(homeIds) || "all homes",
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
    const homeIds = applicableHomeIds(kind, homes, repo.repo);
    return installManyTracked(repo.repo, repo.url, homeIds);
  }

  async function toggleDeprecated(): Promise<void> {
    showDeprecated = !showDeprecated;
    await cairn.setConfig("cairn", "showDeprecated", showDeprecated);
  }

  onMount(() => {
    reload();
    loadViewMode("plugins").then((mode) => (view = mode));
    cairn.getConfig("cairn", "showDeprecated").then((r) => {
      showDeprecated = r.ok && r.data === true;
    });
  });

  // Refresh the catalog whenever the titlebar's GitHub menu changes the active
  // account (a token change affects which repos/manifests the catalog can see).
  // Skip the initial fire; onMount's reload() already covers first load.
  let sawInitialGithubChange = false;
  $effect(() => {
    $githubChanged;
    if (!sawInitialGithubChange) {
      sawInitialGithubChange = true;
      return;
    }
    loadCatalog();
    loadGithubStatus();
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
  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search plugins…" />
    {#if updatesEnabled}
      <IconButton name="refresh" title="Check for updates" disabled={checking} onclick={handleCheckUpdates} />
      {#if anyUpdateAvailable}
        <Button onclick={handleUpdateAll} disabled={updatingAll}>{updatingAll ? "Updating..." : "Update all"}</Button>
      {/if}
    {/if}
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
    <Chip label={`Updates ${counts.updatable}`} on={updatableOnly} onclick={() => (updatableOnly = !updatableOnly)} />
    <Chip label={`External ${counts.external}`} on={externalOnly} onclick={() => (externalOnly = !externalOnly)} />
    <Chip label={`Favorites ${counts.favorite}`} on={favoritesOnly} onclick={() => (favoritesOnly = !favoritesOnly)} />
    {#if counts.deprecated > 0}
      <Chip label={`Deprecated ${counts.deprecated}`} on={showDeprecated} onclick={toggleDeprecated} />
    {/if}
  </div>

  {#if showRateLimitBanner}
    <div class="ratelimit-banner">
      <span>GitHub's anonymous rate limit was reached. Installing still works; connect a GitHub account to keep browsing the catalog.</span>
      <div class="ratelimit-actions">
        <Button onclick={connectFromBanner}>
          {ghStatus?.ghCli ? `Connect @${ghStatus.ghCli.login}` : "Connect GitHub account"}
        </Button>
        <button class="dismiss" title="Dismiss" aria-label="Dismiss" onclick={dismissRateLimitBanner}>×</button>
      </div>
    </div>
  {/if}

  {#snippet favoriteButton(p: UnifiedPlugin)}
    <button
      type="button"
      class="favorite"
      class:on={p.favorite}
      title={p.favorite ? "Unfavorite" : "Favorite"}
      aria-label={p.favorite ? "Unfavorite" : "Favorite"}
      onclick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
    >
      {p.favorite ? "★" : "☆"}
    </button>
  {/snippet}

  {#snippet installActions(p: UnifiedPlugin)}
    <div class="actions">
      <div class="ctlw">
        <PluginInstallControl
          block
          plugin={p}
          homes={applicableHomesFor(p)}
          activity={$activeByPlugin[p.name] ?? null}
          updateAvailable={p.updateAvailable}
          {updatesEnabled}
          behindHomes={behindHomesFor(p)}
          brokenHomes={brokenHomesFor(p)}
          onUpdate={() => handleUpdate(p)}
          onRepairHome={(homeId) => repairHome(p, homeId)}
          onUpdateHome={(homeId) => updateHome(p, homeId)}
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
      {@render favoriteButton(p)}
      {#if applicableHomesFor(p).length > 1}
        <AppPills
          apps={applicableHomesFor(p)}
          values={installedMap(p)}
          onToggle={(homeId, on) => (on ? addHome(p, homeId) : removeHome(p, homeId))}
        />
      {/if}
      {@render installActions(p)}
    </div>
  {/snippet}

  {#snippet pluginCard(p: UnifiedPlugin)}
    <div class="plugin-card" data-testid={"plugin-" + p.name}>
      {@render favoriteButton(p)}
      <button class="card-open" title={`View ${p.displayName}`} onclick={() => (selectedName = p.name)}>
        <PluginIcon icon={p.icon} name={p.displayName} kind={p.kind} size={LOGO_SIZE.list} />
        <span class="card-text">
          <span class="card-title">
            <b>{p.displayName}</b>
            {#if versionLabelFor(p)}<span class="ver">{versionLabelFor(p)}</span>{/if}
            {#if badgeLabel(p)}
              <span class="chip" title={p.external ? "Installed from a repo outside the marketplace org" : undefined}>{badgeLabel(p)}</span>
            {/if}
          </span>
          <span class="card-desc">{p.description ?? ""}</span>
        </span>
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
      brokenHomes={brokenHomesFor(selectedPlugin)}
      activity={$activeByPlugin[selectedPlugin.name] ?? null}
      onClose={() => (selectedName = null)}
      onInstallAll={() => handleInstallAll(selectedPlugin)}
      onRemoveEverywhere={() => confirmRemoveEverywhere(selectedPlugin)}
      onUpdate={() => handleUpdate(selectedPlugin)}
      onRepairHome={(homeId) => repairHome(selectedPlugin, homeId)}
      onUpdateHome={(homeId) => updateHome(selectedPlugin, homeId)}
      onToggleHome={(homeId, on) => (on ? addHome(selectedPlugin, homeId) : removeHome(selectedPlugin, homeId))}
      onToggleFavorite={() => toggleFavorite(selectedPlugin)}
      onChanged={reload}
    />
  {/if}

  {#if connectDialogOpen}
    <GitHubConnectDialog mode="add" onCancel={() => { connectDialogOpen = false; pendingStarPlugin = null; }} onDone={finishBannerConnect} />
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
  .ratelimit-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    margin: 0 2px 14px;
    border-radius: 10px;
    background: var(--accent-weak);
    border: 1px solid var(--accent-border);
    font-size: 12.5px;
    color: var(--text);
  }
  .ratelimit-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: none;
  }
  .ratelimit-banner .dismiss {
    all: unset;
    cursor: pointer;
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    color: var(--muted);
    font-size: 14px;
  }
  .ratelimit-banner .dismiss:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  /* The point of this view is seeing many plugins at once, so the tracks are narrow
     and the gap tight; the row view is the one that trades density for detail. */
  .plugins-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(215px, 1fr));
    gap: 10px;
  }
  .plugin-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px 13px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .plugin-card .favorite {
    position: absolute;
    top: 10px;
    right: 10px;
  }
  .plugin-card .card-open {
    padding-right: 26px;
  }
  .card-open {
    /* Icon beside the text, not stacked above it: stacking cost a whole row of
       height per card and left the mark floating on a line of its own. */
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 10px;
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
  .card-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .card-desc {
    color: var(--muted);
    font-size: 12px;
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-footer {
    display: flex;
    justify-content: flex-end;
    /* Cards in a row stretch to the tallest, so without this the action sits at a
       different height in every card and the grid reads as ragged. */
    margin-top: auto;
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
  .favorite {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--faint);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
  .favorite:hover {
    background: var(--surface-2);
    color: var(--muted);
  }
  .favorite.on {
    color: #e3b341;
  }
  .favorite:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .ctlw {
    width: 172px;
    flex: none;
  }
</style>
