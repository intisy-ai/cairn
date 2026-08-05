<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, PluginConfigSchema, SyncStatus, SyncCategories } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { applyThemeSetting } from "../theme.js";
  import type { ThemeSetting } from "../theme.js";
  import Card from "../components/Card.svelte";
  import ToggleSwitch from "../components/ToggleSwitch.svelte";
  import Button from "../components/Button.svelte";
  import Spinner from "../components/Spinner.svelte";
  import PluginControls from "../components/PluginControls.svelte";
  import GlobalSettings from "../components/GlobalSettings.svelte";
  import AutoUpdateSettings from "../components/AutoUpdateSettings.svelte";
  import GitHubAccounts from "../components/GitHubAccounts.svelte";

  let themeSetting = $state<ThemeSetting>("system");
  let showDeprecated = $state(true);
  let autoUpdateDefault = $state(true);
  let proxyAutostart = $state(false);

  let sections = $state<HomePlugins[]>([]);
  let sectionsError = $state("");
  let schemasByHome = $state<Record<string, PluginConfigSchema[]>>({});

  const appGroups = $derived(sections.filter((s) => s.home.id === "cairn" || s.home.present));

  async function loadCairnSettings(): Promise<void> {
    const [theme, deprecated, autoUpdate, autostart] = await Promise.all([
      cairn.getConfig("cairn", "theme"),
      cairn.getConfig("cairn", "showDeprecated"),
      cairn.getConfig("cairn", "autoUpdateDefault"),
      cairn.getConfig("cairn", "proxyAutostart"),
    ]);
    themeSetting = theme.ok && (theme.data === "light" || theme.data === "dark" || theme.data === "system") ? theme.data : "system";
    showDeprecated = !(deprecated.ok && deprecated.data === false);
    autoUpdateDefault = !(autoUpdate.ok && autoUpdate.data === false);
    proxyAutostart = autostart.ok && autostart.data === true;
    applyThemeSetting(themeSetting);
  }

  async function loadAppGroups(): Promise<void> {
    const result = await cairn.pluginsList();
    if (!result.ok) {
      sectionsError = result.error;
      return;
    }
    sectionsError = "";
    sections = result.data;
    for (const group of sections.filter((s) => s.home.id === "cairn" || s.home.present)) {
      const schemas = await cairn.configSchemas(group.home.id);
      if (schemas.ok) schemasByHome = { ...schemasByHome, [group.home.id]: schemas.data };
    }
  }

  async function handleThemeChange(next: ThemeSetting): Promise<void> {
    themeSetting = next;
    applyThemeSetting(next);
    await cairn.setConfig("cairn", "theme", next);
  }

  async function handleShowDeprecatedChange(on: boolean): Promise<void> {
    showDeprecated = on;
    await cairn.setConfig("cairn", "showDeprecated", on);
  }

  async function handleAutoUpdateChange(on: boolean): Promise<void> {
    autoUpdateDefault = on;
    await cairn.setConfig("cairn", "autoUpdateDefault", on);
  }

  async function handleProxyAutostartChange(on: boolean): Promise<void> {
    proxyAutostart = on;
    await cairn.setConfig("cairn", "proxyAutostart", on);
  }

  const SYNC_CATEGORIES: { key: keyof SyncCategories; label: string; desc: string }[] = [
    { key: "accounts", label: "Accounts", desc: "Mirror provider logins across apps (no login is ever lost)." },
    { key: "plugins", label: "Plugins", desc: "Install a plugin in one app and it appears in the others." },
    { key: "settings", label: "Global settings", desc: "Share config/settings.json across apps (secrets excluded)." },
    { key: "pluginConfigs", label: "Plugin configs", desc: "Share each plugin's config across apps (secrets excluded)." },
  ];

  let sync = $state<SyncStatus | null>(null);
  let syncRunning = $state(false);

  async function loadSync(): Promise<void> {
    const result = await cairn.syncStatus();
    if (result.ok) sync = result.data;
  }

  async function handleSyncEnabled(on: boolean): Promise<void> {
    if (sync) sync = { ...sync, enabled: on };
    await cairn.syncSetConfig("enabled", on);
  }

  async function handleSyncCategory(key: keyof SyncCategories, on: boolean): Promise<void> {
    if (!sync) return;
    const categories = { ...sync.categories, [key]: on };
    sync = { ...sync, categories };
    await cairn.syncSetConfig("categories", categories);
  }

  async function handleSyncNow(): Promise<void> {
    if (syncRunning) return;
    syncRunning = true;
    try {
      await cairn.syncRun();
      await loadSync();
    } finally {
      syncRunning = false;
    }
  }

  onMount(() => {
    loadCairnSettings();
    loadAppGroups();
    loadSync();
  });
</script>

<div class="head">
  <div>
    <h1>Settings</h1>
    <p>Appearance, marketplace defaults, and per-app plugin configuration.</p>
  </div>
</div>

<section class="category">
  <h2>Appearance</h2>
  <Card>
    <div class="row">
      <div class="info">
        <b>Theme</b>
        <span class="desc">Follow the system, or force light or dark.</span>
      </div>
      <select
        aria-label="Theme"
        value={themeSetting}
        onchange={(event) => handleThemeChange((event.currentTarget as HTMLSelectElement).value as ThemeSetting)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  </Card>
</section>

<section class="category">
  <h2>GitHub</h2>
  <Card>
    <GitHubAccounts />
  </Card>
</section>

<section class="category">
  <h2>Marketplace</h2>
  <Card>
    <div class="row">
      <div class="info">
        <b>Show deprecated plugins</b>
        <span class="desc">Keep deprecated marketplace entries visible in a bottom group.</span>
      </div>
      <ToggleSwitch checked={showDeprecated} label="Show deprecated plugins" onchange={handleShowDeprecatedChange} />
    </div>
  </Card>
</section>

<section class="category">
  <h2>Plugins</h2>
  <Card>
    <div class="row">
      <div class="info">
        <b>Auto-update new installs</b>
        <span class="desc">Newly installed plugins start with auto-update enabled.</span>
      </div>
      <ToggleSwitch checked={autoUpdateDefault} label="Auto-update new installs" onchange={handleAutoUpdateChange} />
    </div>
  </Card>
</section>

<section class="category">
  <h2>Local API</h2>
  <Card>
    <div class="row">
      <div class="info">
        <b>Start the local API on launch</b>
        <span class="desc">Autostart the proxy daemon when Cairn opens.</span>
      </div>
      <ToggleSwitch checked={proxyAutostart} label="Start the local API on launch" onchange={handleProxyAutostartChange} />
    </div>
  </Card>
</section>

<section class="category">
  <h2>Advanced</h2>
  <GlobalSettings />
</section>

<section class="category">
  <h2>Sync</h2>
  <Card>
    <div class="row">
      <div class="info">
        <b>Sync across apps</b>
        <span class="desc">Keep accounts, plugins, and settings mirrored across every app. Secrets are never shared.</span>
      </div>
      <ToggleSwitch checked={sync?.enabled ?? true} label="Sync across apps" onchange={handleSyncEnabled} />
    </div>
    {#each SYNC_CATEGORIES as cat (cat.key)}
      <div class="row">
        <div class="info">
          <b>{cat.label}</b>
          <span class="desc">{cat.desc}</span>
        </div>
        <ToggleSwitch
          checked={sync?.categories?.[cat.key] ?? true}
          label={cat.label}
          disabled={sync?.enabled === false}
          onchange={(on) => handleSyncCategory(cat.key, on)}
        />
      </div>
    {/each}
    <div class="row">
      <div class="info">
        <b>Sync now</b>
        <span class="desc">
          {#if sync && sync.homes.length > 0}Reconciles {sync.homes.length} app home{sync.homes.length === 1 ? "" : "s"} immediately.{:else}Runs a reconcile across your app homes.{/if}
        </span>
      </div>
      <Button disabled={syncRunning || sync?.enabled === false} onclick={handleSyncNow}>
        {#if syncRunning}<Spinner />{/if}
        Sync now
      </Button>
    </div>
  </Card>
</section>

<section class="category">
  <h2>Per-app configuration</h2>
  {#if sectionsError}
    <p class="error">Could not load apps: {sectionsError}</p>
  {/if}
  {#each appGroups as group (group.home.id)}
    <div class="apphome" data-testid={"settings-home-" + group.home.id}>
      <h3>{group.home.label}</h3>
      <Card>
        <div class="updates">
          <AutoUpdateSettings homeId={group.home.id} />
        </div>
        {#each schemasByHome[group.home.id] ?? [] as schema (schema.plugin)}
          <details class="plugin">
            <summary>{schema.plugin}</summary>
            <div class="fields">
              <PluginControls homeId={group.home.id} {schema} />
            </div>
          </details>
        {/each}
        {#if (schemasByHome[group.home.id] ?? []).length === 0}
          <p class="empty">No configurable plugins.</p>
        {/if}
      </Card>
    </div>
  {/each}
</section>

<style>
  .updates {
    padding-bottom: 10px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
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
  .category {
    margin-bottom: 22px;
  }
  .category h2 {
    margin: 0 2px 10px;
    font-size: 13px;
    font-weight: 650;
    letter-spacing: -.01em;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .info b {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .desc {
    color: var(--muted);
    font-size: 12px;
  }
  select {
    font-family: var(--ui);
    font-size: 12.5px;
    font-weight: 600;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
  }
  .apphome {
    margin-bottom: 14px;
  }
  .apphome h3 {
    margin: 0 2px 8px;
    font-size: 12px;
    font-weight: 650;
    color: var(--muted);
  }
  .plugin {
    border-top: 1px solid var(--border);
  }
  .plugin:first-child {
    border-top: 0;
  }
  .plugin summary {
    cursor: pointer;
    padding: 12px 18px;
    font-size: 12.5px;
    font-weight: 600;
    list-style: none;
  }
  .plugin summary::-webkit-details-marker {
    display: none;
  }
  .fields {
    padding: 0 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
