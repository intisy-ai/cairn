<script lang="ts">
  import { onMount } from "svelte";
  import type { ImportableApp, HomePlugins, CatalogEntry, CatalogKind, PluginHomeId } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import StatusPill from "../components/StatusPill.svelte";
  import PluginRow from "../components/PluginRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";

  type AppId = "claude" | "opencode";

  let selectedHome = $state<PluginHomeId | null>(null);

  let appsError = $state("");
  let busyApps = $state<Record<AppId, boolean>>({ claude: false, opencode: false });

  let sections = $state<HomePlugins[]>([]);
  let pluginsError = $state("");

  let catalog = $state<CatalogEntry[]>([]);
  let catalogSource = $state<"env" | "gh" | "anonymous">("gh");
  let installBusy = $state<string>("");

  let importable = $state<ImportableApp[]>([]);
  let importBusy = $state<Record<AppId, boolean>>({ claude: false, opencode: false });
  let importNotes = $state<Record<AppId, string[]>>({ claude: [], opencode: [] });
  let importErrors = $state<Record<AppId, string>>({ claude: "", opencode: "" });

  let uninstallArm = $state("");

  const selectedSection = $derived(sections.find((s) => s.home.id === selectedHome) ?? null);

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

  function availableFor(section: HomePlugins): CatalogEntry[] {
    if (!section.home.hasUpdater) return [];
    const installed = new Set(section.rows.map((r) => r.name));
    const allowed: (k: CatalogKind) => boolean =
      section.home.id === "cairn" ? (k) => k !== "plugin" : (k) => k !== "proxy";
    return catalog.filter((e) => allowed(e.kind) && !installed.has(e.name));
  }

  async function handleInstallPlugin(home: string, entry: CatalogEntry): Promise<void> {
    const key = `${home}/${entry.name}`;
    if (installBusy === key) return;
    installBusy = key;
    try {
      await cairn.pluginsInstall(home, entry.name, entry.url);
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
    await withAppBusy(app, () => cairn.appsInstallCli(app));
  }

  async function handleInit(app: AppId): Promise<void> {
    await withAppBusy(app, () => cairn.appsInit(app));
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
    await cairn.pluginsUninstall(home, name);
    uninstallArm = "";
    await loadPlugins();
  }

  onMount(() => {
    loadApps();
    loadPlugins();
    loadCatalog();
    loadImportable();
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
{:else if selectedSection}
  {@const detail = selectedSection}
  <section class="group" data-testid={"home-" + detail.home.id}>
    <div class="detailhead">
      <button class="backbtn" aria-label="Back to apps" onclick={() => (selectedHome = null)}>&larr; Back to apps</button>
      <h2>{detail.home.label}</h2>
    </div>
    {#if detail.home.id !== "cairn"}
      {@const app = detail.home.id as AppId}
      <div class="actions detailactions">
        {#if canImport(app)}
          <Button disabled={importBusy[app]} onclick={() => handleImportConfig(app)}>Import config</Button>
        {/if}
        {#if detail.home.hasUpdater}
          <Button disabled={busyApps[app]} onclick={() => handleInit(app)}>Reinit</Button>
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
    {/if}
    <Card>
      {#each detail.rows as plugin (plugin.name)}
        <PluginRow
          name={plugin.name}
          kind={plugin.kind}
          installedVersion={plugin.installedVersion}
          updateAvailable={plugin.updateAvailable}
          enabled={plugin.enabled}
          onToggle={(on) => handleToggle(detail.home.id, plugin.name, on)}
          onUninstall={plugin.name === "plugin-updater" ? undefined : () => handleUninstall(detail.home.id, plugin.name)}
          uninstallState={uninstallArm === `${detail.home.id}/${plugin.name}` ? "confirm" : "idle"}
        />
      {/each}
      {#if detail.rows.length === 0}
        <p class="empty">No plugins installed.</p>
      {/if}
      {#if !detail.home.hasUpdater}
        <p class="hint">Install plugin-updater to manage plugins here.</p>
      {:else}
        {#each availableFor(detail) as entry (entry.name)}
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
        {/each}
      {/if}
    </Card>
    {#if catalogSource === "anonymous"}
      <p class="hint">Marketplace unauthenticated: sign in with the gh CLI or set GITHUB_TOKEN for reliable listings.</p>
    {/if}
  </section>
{:else}
  {#each sections as section (section.home.id)}
    <section class="group" data-testid={"home-" + section.home.id}>
      <Card>
        <div class="row masterrow">
          {#if section.home.present}
            <button class="rowmain" aria-label={"Open " + section.home.label + " plugins"} onclick={() => (selectedHome = section.home.id)}>
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
            {:else if section.home.id !== "cairn" && !section.home.hasUpdater}
              {@const app = section.home.id as AppId}
              <Button disabled={busyApps[app]} onclick={() => handleInit(app)}>Init</Button>
            {/if}
          </div>
        </div>
      </Card>
    </section>
  {/each}
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
  .import-row-error {
    padding: 0 18px 10px;
  }
  .import-notes {
    margin: 0;
    padding: 0 18px 12px 34px;
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
