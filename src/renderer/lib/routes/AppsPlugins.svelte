<script lang="ts">
  import { onMount } from "svelte";
  import type { AppPresence, ImportableApp, HomePlugins, CatalogEntry, CatalogKind } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import StatusPill from "../components/StatusPill.svelte";
  import PluginRow from "../components/PluginRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";

  type AppId = "claude" | "opencode";

  const HOST_APPS: { id: AppId; label: string }[] = [
    { id: "claude", label: "Claude Code" },
    { id: "opencode", label: "OpenCode" },
  ];

  let presence = $state<AppPresence | null>(null);
  let appsError = $state("");
  let busyApps = $state<Record<AppId, boolean>>({ claude: false, opencode: false });

  let sections = $state<HomePlugins[]>([]);
  let pluginsError = $state("");
  const presentSections = $derived(sections.filter((s) => s.home.present));

  let catalog = $state<CatalogEntry[]>([]);
  let catalogSource = $state<"env" | "gh" | "anonymous">("gh");
  let installBusy = $state<string>("");

  let importable = $state<ImportableApp[]>([]);
  let importBusy = $state<Record<AppId, boolean>>({ claude: false, opencode: false });
  let importNotes = $state<Record<AppId, string[]>>({ claude: [], opencode: [] });
  let importErrors = $state<Record<AppId, string>>({ claude: "", opencode: "" });

  function isInstalled(app: AppId): boolean {
    return presence?.[app] ?? false;
  }

  function canImport(app: AppId): boolean {
    return importable.some((a) => a.app === app && a.hasConfig);
  }

  async function loadApps(): Promise<void> {
    const result = await cairn.appsDetect();
    if (result.ok) {
      presence = result.data;
      appsError = "";
    } else {
      appsError = result.error;
    }
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

<section class="group">
  <div class="grouphead">
    <p class="label">Host CLIs</p>
    <span class="line"></span>
  </div>
  {#if appsError}
    <p class="error">Could not load app status: {appsError}</p>
  {:else}
    <Card>
      {#each HOST_APPS as app (app.id)}
        <div class="row">
          <div class="info">
            <b>{app.label}</b>
            <StatusPill
              variant={isInstalled(app.id) ? "good" : "off"}
              label={isInstalled(app.id) ? "Installed" : "Not installed"}
            />
          </div>
          <div class="actions">
            {#if isInstalled(app.id)}
              <Button disabled={busyApps[app.id]} onclick={() => handleInit(app.id)}>Init</Button>
            {:else}
              <Button variant="primary" disabled={busyApps[app.id]} onclick={() => handleInstall(app.id)}>Install</Button>
            {/if}
            {#if canImport(app.id)}
              <Button disabled={importBusy[app.id]} onclick={() => handleImportConfig(app.id)}>Import config</Button>
            {/if}
          </div>
        </div>
        {#if importErrors[app.id]}
          <p class="error import-row-error">{importErrors[app.id]}</p>
        {/if}
        {#if importNotes[app.id].length > 0}
          <ul class="import-notes">
            {#each importNotes[app.id] as note}<li>{note}</li>{/each}
          </ul>
        {/if}
      {/each}
    </Card>
  {/if}
</section>

{#if pluginsError}
  <section class="group">
    <div class="grouphead">
      <p class="label">Plugins</p>
      <span class="line"></span>
    </div>
    <p class="error">Could not load plugins: {pluginsError}</p>
  </section>
{:else}
  {#each presentSections as section, i (section.home.id)}
    <section class="group" data-testid={"home-" + section.home.id}>
      <div class="grouphead">
        <p class="label">{section.home.label}</p>
        <span class="count">{section.rows.length}</span>
        <span class="line"></span>
      </div>
      <Card>
        {#each section.rows as plugin (plugin.name)}
          <PluginRow
            name={plugin.name}
            kind={plugin.kind}
            installedVersion={plugin.installedVersion}
            updateAvailable={plugin.updateAvailable}
            enabled={plugin.enabled}
            onToggle={(on) => handleToggle(section.home.id, plugin.name, on)}
          />
        {/each}
        {#if section.rows.length === 0}
          <p class="empty">No plugins installed.</p>
        {/if}
        {#if !section.home.hasUpdater}
          <p class="hint">Install plugin-updater to manage plugins here.</p>
        {:else}
          {#each availableFor(section) as entry (entry.name)}
            <div class="row">
              <div class="info">
                <b>{entry.name}</b>
                <span class="chip">{entry.kind}</span>
                <span class="desc">{entry.description}</span>
              </div>
              <div class="actions">
                <Button
                  disabled={installBusy === section.home.id + "/" + entry.name}
                  onclick={() => handleInstallPlugin(section.home.id, entry)}
                >Install</Button>
              </div>
            </div>
          {/each}
        {/if}
      </Card>
      {#if i === presentSections.length - 1 && catalogSource === "anonymous"}
        <p class="hint">Marketplace unauthenticated: sign in with the gh CLI or set GITHUB_TOKEN for reliable listings.</p>
      {/if}
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
    align-items: center;
    gap: 12px;
  }
  .info b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
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
