<script lang="ts">
  import { onMount } from "svelte";
  import type { ImportableApp, HomePlugins, CatalogEntry, CatalogKind, PluginHomeId, PluginRow as PluginRowData, AppSummary } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { consumeParams } from "../router.js";
  import { track } from "../downloads.js";
  import { debounce } from "../util/debounce.js";
  import StatusPill from "../components/StatusPill.svelte";
  import PluginRow from "../components/PluginRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import Chip from "../components/Chip.svelte";
  import SearchField from "../components/SearchField.svelte";
  import VirtualList from "../components/VirtualList.svelte";

  type AppId = "claude" | "opencode";
  type KindFilter = CatalogKind | "all";

  const KIND_FILTERS: { id: KindFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "provider", label: "Providers" },
    { id: "proxy", label: "Proxies" },
    { id: "plugin", label: "Plugins" },
  ];

  const VIRTUALIZE_THRESHOLD = 20;
  const HOME_CARD_HEIGHT = 84;
  const PLUGIN_ROW_HEIGHT = 64;

  let selectedHome = $state<PluginHomeId | null>(null);

  let appsError = $state("");
  let busyApps = $state<Record<AppId, boolean>>({ claude: false, opencode: false });

  let sections = $state<HomePlugins[]>([]);
  let pluginsError = $state("");

  let catalog = $state<CatalogEntry[]>([]);
  let catalogSource = $state<"env" | "gh" | "anonymous">("gh");
  let installBusy = $state<string>("");
  let machineryBusy = $state(false);

  let importable = $state<ImportableApp[]>([]);
  let importBusy = $state<Record<AppId, boolean>>({ claude: false, opencode: false });
  let importNotes = $state<Record<AppId, string[]>>({ claude: [], opencode: [] });
  let importErrors = $state<Record<AppId, string>>({ claude: "", opencode: "" });

  let uninstallArm = $state("");

  let searchRaw = $state("");
  let search = $state("");
  let kindFilter = $state<KindFilter>("all");
  let showDeprecated = $state(true);

  let homeSearchRaw = $state("");
  let homeSearch = $state("");

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  const applyHomeSearch = debounce((value: string) => {
    homeSearch = value;
  }, 120);

  $effect(() => {
    applyHomeSearch(homeSearchRaw);
  });

  let appSummary = $state<AppSummary | null>(null);
  let appSummaryError = $state("");

  let appUninstallOpen = $state(false);
  let appUninstallWipe = $state(false);

  const selectedSection = $derived(sections.find((s) => s.home.id === selectedHome) ?? null);

  const filteredSections = $derived(
    sections.filter((s) => {
      const needle = homeSearch.trim().toLowerCase();
      return !needle || s.home.label.toLowerCase().includes(needle);
    }),
  );

  $effect(() => {
    selectedHome;
    uninstallArm = "";
    appUninstallOpen = false;
    appUninstallWipe = false;
    machineryBusy = false;
  });

  $effect(() => {
    const home = selectedHome;
    if (home !== "claude" && home !== "opencode") {
      appSummary = null;
      appSummaryError = "";
      return;
    }
    appSummary = null;
    appSummaryError = "";
    cairn.appsSummary(home).then((result) => {
      if (selectedHome !== home) return;
      if (result.ok) {
        appSummary = result.data;
      } else {
        appSummaryError = result.error;
      }
    });
  });

  function canImport(app: AppId): boolean {
    return importable.some((a) => a.app === app && a.hasConfig);
  }

  async function loadApps(): Promise<void> {
    const result = await cairn.appsDetect();
    appsError = result.ok ? "" : result.error;
  }

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
      catalogSource = result.data.source;
    }
  }

  async function loadShowDeprecated(): Promise<void> {
    const result = await cairn.getConfig("cairn", "showDeprecated");
    if (result.ok && result.data === false) showDeprecated = false;
  }

  function catalogKindOf(name: string): CatalogKind | null {
    return catalog.find((e) => e.name === name)?.kind ?? null;
  }

  function isDeprecated(name: string): boolean {
    return catalog.some((e) => e.name === name && e.deprecated);
  }

  function matchesSearchText(text: string): boolean {
    const needle = search.trim().toLowerCase();
    return !needle || text.toLowerCase().includes(needle);
  }

  function rowMatchesFilters(row: PluginRowData): boolean {
    if (!matchesSearchText(row.name)) return false;
    return kindFilter === "all" || catalogKindOf(row.name) === kindFilter;
  }

  function entryMatchesFilters(entry: CatalogEntry): boolean {
    if (kindFilter !== "all" && entry.kind !== kindFilter) return false;
    const needle = search.trim().toLowerCase();
    return !needle || entry.name.toLowerCase().includes(needle) || entry.description.toLowerCase().includes(needle);
  }

  function rawInstalledRows(section: HomePlugins): PluginRowData[] {
    return section.rows.filter((r) => r.name !== "plugin-updater");
  }

  function installedRowsFor(section: HomePlugins): PluginRowData[] {
    return rawInstalledRows(section).filter(rowMatchesFilters);
  }

  function availableFor(section: HomePlugins): CatalogEntry[] {
    if (!section.home.hasUpdater) return [];
    const installed = new Set(section.rows.map((r) => r.name));
    const allowed: (k: CatalogKind) => boolean =
      section.home.id === "cairn" ? (k) => k !== "plugin" : (k) => k !== "proxy";
    return catalog.filter((e) => allowed(e.kind) && e.name !== "plugin-updater" && !installed.has(e.name));
  }

  function mainCatalogFor(section: HomePlugins): CatalogEntry[] {
    return availableFor(section).filter((e) => !e.deprecated).filter(entryMatchesFilters);
  }

  function deprecatedCatalogFor(section: HomePlugins): CatalogEntry[] {
    return availableFor(section).filter((e) => e.deprecated).filter(entryMatchesFilters);
  }

  function homeLabelFor(app: AppId): string {
    return sections.find((s) => s.home.id === app)?.home.label ?? app;
  }

  async function handleInstallPlugin(home: string, entry: CatalogEntry): Promise<void> {
    const key = `${home}/${entry.name}`;
    if (installBusy === key) return;
    installBusy = key;
    try {
      await track(`Install ${entry.name}`, home, () => cairn.pluginsInstall(home, entry.name, entry.url));
      await loadPlugins();
    } finally {
      installBusy = "";
    }
  }

  async function loadImportable(): Promise<void> {
    const result = await cairn.importApps();
    if (result.ok) importable = result.data;
  }

  async function handleImportConfig(app: AppId): Promise<void> {
    if (importBusy[app]) return;
    importBusy = { ...importBusy, [app]: true };
    importErrors = { ...importErrors, [app]: "" };
    try {
      const result = await cairn.importRun(app);
      if (result.ok) {
        importNotes = { ...importNotes, [app]: result.data.notes };
      } else {
        importErrors = { ...importErrors, [app]: result.error };
      }
    } finally {
      importBusy = { ...importBusy, [app]: false };
    }
  }

  async function withAppBusy(app: AppId, action: () => Promise<unknown>): Promise<void> {
    if (busyApps[app]) return;
    busyApps = { ...busyApps, [app]: true };
    try {
      await action();
      await loadApps();
      await loadPlugins();
    } finally {
      busyApps = { ...busyApps, [app]: false };
    }
  }

  async function handleInstall(app: AppId): Promise<void> {
    const label = homeLabelFor(app);
    await withAppBusy(app, () => track(`Install ${label} CLI`, app, () => cairn.appsInstallCli(app)));
  }

  async function handleInitUpdater(app: AppId): Promise<void> {
    if (machineryBusy) return;
    machineryBusy = true;
    try {
      await track("Initialize plugin-updater", app, () => cairn.appsInit(app));
      await loadPlugins();
    } finally {
      machineryBusy = false;
    }
  }

  async function handleToggle(home: string, name: string, on: boolean): Promise<void> {
    await cairn.pluginsSetEnabled(home, name, on);
    await loadPlugins();
  }

  async function handleUninstall(home: string, name: string): Promise<void> {
    const key = `${home}/${name}`;
    if (uninstallArm !== key) {
      uninstallArm = key;
      return;
    }
    await track(`Uninstall ${name}`, home, () => cairn.pluginsUninstall(home, name));
    uninstallArm = "";
    await loadPlugins();
  }

  async function handleAppUninstall(app: AppId, label: string): Promise<void> {
    await track(`Uninstall ${label}`, app, () => cairn.appsUninstallCli(app, appUninstallWipe));
    appUninstallOpen = false;
    appUninstallWipe = false;
    await loadApps();
    await loadPlugins();
    selectedHome = null;
  }

  function openHome(id: PluginHomeId): void {
    selectedHome = id;
    searchRaw = "";
    search = "";
    kindFilter = "all";
  }

  function goBack(): void {
    selectedHome = null;
  }

  onMount(() => {
    loadApps();
    loadPlugins();
    loadCatalog();
    loadImportable();
    loadShowDeprecated();

    const params = consumeParams();
    if (params?.home) {
      selectedHome = params.home as PluginHomeId;
      if (params.filter === "provider" || params.filter === "proxy" || params.filter === "plugin") {
        kindFilter = params.filter;
      }
    }
  });
</script>

<div class="head">
  <div>
    <h1>Apps &amp; plugins</h1>
    <p>Host CLI installs and the plugins that extend them.</p>
  </div>
</div>

{#if appsError}
  <p class="error">Could not load app status: {appsError}</p>
{/if}

{#if pluginsError}
  <p class="error">Could not load plugins: {pluginsError}</p>
{:else if sections.length === 0}
  <p class="loading">Loading plugin homes…</p>
{:else if selectedSection}
  {@const detail = selectedSection}
  <section class="group" data-testid={"home-" + detail.home.id}>
    <div class="detailhead">
      <button class="backbtn" aria-label="Back to apps" onclick={goBack}>&larr; Back to apps</button>
      <h2>{detail.home.label}</h2>
    </div>
    {#if detail.home.id !== "cairn"}
      {@const app = detail.home.id as AppId}
      <div class="actions detailactions">
        {#if canImport(app)}
          <Button disabled={importBusy[app]} onclick={() => handleImportConfig(app)}>Import config</Button>
        {/if}
      </div>
      {#if importErrors[app]}
        <p class="error import-row-error">{importErrors[app]}</p>
      {/if}
      {#if importNotes[app].length > 0}
        <ul class="import-notes">
          {#each importNotes[app] as note}<li>{note}</li>{/each}
        </ul>
      {/if}

      {#if appSummaryError}
        <p class="summary-error">Could not load app summary: {appSummaryError}</p>
      {:else if appSummary}
        <Card>
          <div class="summarycard">
            {#if appSummary.accounts.length > 0}
              <div class="summary-accounts">
                {#each appSummary.accounts as acct}
                  <span class="acct-chip"
                    >{acct.provider} · {acct.label} · {acct.enabled ? "enabled" : "disabled"}{acct.quotaPct !== null
                      ? ` · ${acct.quotaPct}%`
                      : ""}</span
                  >
                {/each}
              </div>
            {:else}
              <p class="summary-empty">No accounts connected.</p>
            {/if}
            <div class="summary-meta">
              <span>{appSummary.configDir}</span>
              <span>{appSummary.pluginCount} plugin{appSummary.pluginCount === 1 ? "" : "s"}</span>
              {#if appSummary.routingSlots !== null}
                <span>{appSummary.routingSlots} routing slot{appSummary.routingSlots === 1 ? "" : "s"}</span>
              {/if}
            </div>
          </div>
        </Card>
      {/if}
    {/if}

    <div class="toolbar">
      <SearchField bind:value={searchRaw} placeholder="Search plugins…" />
      {#each KIND_FILTERS as f (f.id)}
        <Chip label={f.label} on={kindFilter === f.id} onclick={() => (kindFilter = f.id)} />
      {/each}
    </div>

    {#snippet installedPluginRow(plugin: PluginRowData)}
      <PluginRow
        name={plugin.name}
        kind={plugin.kind}
        installedVersion={plugin.installedVersion}
        updateAvailable={plugin.updateAvailable}
        enabled={plugin.enabled}
        deprecated={isDeprecated(plugin.name)}
        catalogKind={catalogKindOf(plugin.name) ?? undefined}
        onToggle={(on) => handleToggle(detail.home.id, plugin.name, on)}
        onUninstall={plugin.name === "plugin-updater" ? undefined : () => handleUninstall(detail.home.id, plugin.name)}
        uninstallState={uninstallArm === `${detail.home.id}/${plugin.name}` ? "confirm" : "idle"}
      />
    {/snippet}

    {#snippet marketplaceRow(entry: CatalogEntry)}
      <div class="row">
        <div class="info">
          <b>{entry.name}</b>
          <span class="chip">{entry.kind}</span>
          <span class="desc">{entry.description}</span>
        </div>
        <div class="actions">
          <Button
            disabled={installBusy === detail.home.id + "/" + entry.name}
            onclick={() => handleInstallPlugin(detail.home.id, entry)}
          >Install</Button>
        </div>
      </div>
    {/snippet}

    <Card>
      {#if detail.home.id !== "cairn"}
        {@const app = detail.home.id as AppId}
        <div class="row" data-testid="machinery-row">
          <div class="info">
            <b>plugin-updater</b>
          </div>
          <div class="actions">
            {#if detail.home.hasUpdater}
              <StatusPill variant="good" label="Installed" />
            {:else}
              <StatusPill variant="off" label="Not installed" />
              <Button disabled={machineryBusy} onclick={() => handleInitUpdater(app)}>Install</Button>
            {/if}
          </div>
        </div>
      {/if}
      {@const installed = installedRowsFor(detail)}
      {#if installed.length > VIRTUALIZE_THRESHOLD}
        <VirtualList items={installed} rowHeight={PLUGIN_ROW_HEIGHT}>
          {#snippet row(plugin)}
            {@render installedPluginRow(plugin)}
          {/snippet}
        </VirtualList>
      {:else}
        {#each installed as plugin (plugin.name)}
          {@render installedPluginRow(plugin)}
        {/each}
      {/if}
      {#if rawInstalledRows(detail).length === 0}
        <p class="empty">No plugins installed.</p>
      {:else if installed.length === 0}
        <p class="empty">No plugins match your filters.</p>
      {/if}
      {#if !detail.home.hasUpdater}
        <p class="hint">Install plugin-updater to manage plugins here.</p>
      {:else}
        {@const mainCatalog = mainCatalogFor(detail)}
        <div class="marketmain" data-testid="marketplace-main">
          {#if mainCatalog.length > VIRTUALIZE_THRESHOLD}
            <VirtualList items={mainCatalog} rowHeight={PLUGIN_ROW_HEIGHT}>
              {#snippet row(entry)}
                {@render marketplaceRow(entry)}
              {/snippet}
            </VirtualList>
          {:else}
            {#each mainCatalog as entry (entry.name)}
              {@render marketplaceRow(entry)}
            {/each}
          {/if}
        </div>
        {#if showDeprecated}
          {@const deprecatedList = deprecatedCatalogFor(detail)}
          {#if deprecatedList.length > 0}
            <details class="deprecated-group" data-testid="deprecated-group">
              <summary>Deprecated</summary>
              {#if deprecatedList.length > VIRTUALIZE_THRESHOLD}
                <VirtualList items={deprecatedList} rowHeight={PLUGIN_ROW_HEIGHT}>
                  {#snippet row(entry)}
                    {@render marketplaceRow(entry)}
                  {/snippet}
                </VirtualList>
              {:else}
                {#each deprecatedList as entry (entry.name)}
                  {@render marketplaceRow(entry)}
                {/each}
              {/if}
            </details>
          {/if}
        {/if}
      {/if}
    </Card>
    {#if catalogSource === "anonymous"}
      <p class="hint">Marketplace unauthenticated: sign in with the gh CLI or set GITHUB_TOKEN for reliable listings.</p>
    {/if}

    {#if detail.home.id !== "cairn"}
      {@const app = detail.home.id as AppId}
      <div class="dangerzone">
        <Button variant="danger" onclick={() => {
          appUninstallOpen = !appUninstallOpen;
          if (appUninstallOpen) {
            appUninstallWipe = false;
          }
        }}>Uninstall app</Button>
        {#if appUninstallOpen}
          <div class="dangerpanel">
            <p>
              This removes the {detail.home.label} CLI from this machine. Plugins and configuration stay in place unless
              you also delete data.
            </p>
            <label class="wipe">
              <input type="checkbox" bind:checked={appUninstallWipe} />
              Also delete all data
            </label>
            <div class="actions">
              <Button onclick={() => {
                appUninstallOpen = false;
                appUninstallWipe = false;
              }}>Cancel</Button>
              <Button variant="danger" onclick={() => handleAppUninstall(app, detail.home.label)}>Uninstall</Button>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>
{:else}
  <div class="toolbar">
    <SearchField bind:value={homeSearchRaw} placeholder="Search apps…" />
  </div>
  {#snippet homeCard(section: HomePlugins)}
    <section class="group" data-testid={"home-" + section.home.id}>
      <Card>
        <div class="row masterrow">
          {#if section.home.present}
            <button class="rowmain" aria-label={"Open " + section.home.label + " plugins"} onclick={() => openHome(section.home.id)}>
              <div class="info">
                <b>{section.home.label}</b>
                {#if section.home.id !== "cairn"}
                  <StatusPill variant="good" label="Installed" />
                {/if}
                <span class="count">{section.rows.length} installed</span>
              </div>
            </button>
          {:else}
            <div class="info">
              <b>{section.home.label}</b>
              <StatusPill variant="off" label="Not installed" />
            </div>
          {/if}
          <div class="actions">
            {#if !section.home.present}
              {@const app = section.home.id as AppId}
              <Button variant="primary" disabled={busyApps[app]} onclick={() => handleInstall(app)}>Install CLI</Button>
            {/if}
          </div>
        </div>
      </Card>
    </section>
  {/snippet}
  {#if filteredSections.length > VIRTUALIZE_THRESHOLD}
    <VirtualList items={filteredSections} rowHeight={HOME_CARD_HEIGHT}>
      {#snippet row(section)}
        {@render homeCard(section)}
      {/snippet}
    </VirtualList>
  {:else}
    {#each filteredSections as section (section.home.id)}
      {@render homeCard(section)}
    {/each}
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
  .group {
    margin-bottom: 26px;
  }
  .detailhead {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 2px 14px;
  }
  .detailhead h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: -.01em;
  }
  .backbtn {
    all: unset;
    cursor: pointer;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 600;
  }
  .backbtn:hover {
    color: var(--text);
  }
  .backbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
  .marketmain {
    display: contents;
  }
  .rowmain {
    all: unset;
    cursor: pointer;
    flex: 1;
    min-width: 0;
    display: flex;
  }
  .rowmain:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
  .info .count {
    font-size: 11px;
    color: var(--faint);
    font-family: var(--mono);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .detailactions {
    margin: 0 2px 12px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 14px;
    flex-wrap: wrap;
  }
  .empty, .hint {
    margin: 0;
    padding: 16px 18px;
    color: var(--faint);
    font-size: 12.5px;
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
  .desc {
    color: var(--muted);
    font-size: 12px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
  .loading {
    color: var(--faint);
    font-size: 13px;
  }
  .import-row-error {
    padding: 0 18px 10px;
  }
  .import-notes {
    margin: 0;
    padding: 0 18px 12px 34px;
    color: var(--muted);
    font-size: 12.5px;
  }
  .deprecated-group {
    border-top: 1px solid var(--border);
  }
  .deprecated-group summary {
    cursor: pointer;
    padding: 12px 18px;
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--faint);
    list-style: none;
  }
  .deprecated-group summary::-webkit-details-marker {
    display: none;
  }
  .summarycard {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .summary-accounts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .acct-chip {
    font-size: 11.5px;
    color: var(--muted);
    background: var(--surface-2);
    padding: 4px 10px;
    border-radius: 20px;
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
    margin: 0 0 14px;
  }
  .dangerzone {
    margin-top: 22px;
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
