<script lang="ts">
  import { onMount } from "svelte";
  import type { HomePlugins, PluginConfigSchema } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { applyThemeSetting } from "../theme.js";
  import type { ThemeSetting } from "../theme.js";
  import Card from "../components/Card.svelte";
  import ToggleSwitch from "../components/ToggleSwitch.svelte";

  type FieldKind = "boolean" | "number" | "string" | "json";
  type Field = { key: string; value: unknown; kind: FieldKind };

  let themeSetting = $state<ThemeSetting>("system");
  let showDeprecated = $state(true);
  let autoUpdateDefault = $state(true);
  let proxyAutostart = $state(false);
  let logConsole = $state(false);

  let sections = $state<HomePlugins[]>([]);
  let sectionsError = $state("");
  let schemasByHome = $state<Record<string, PluginConfigSchema[]>>({});

  let fieldError = $state<Record<string, string>>({});
  let fieldSaved = $state<Record<string, boolean>>({});

  const appGroups = $derived(sections.filter((s) => s.home.id === "cairn" || s.home.present));

  function fieldsFor(schema: PluginConfigSchema): Field[] {
    const keys = [...new Set([...Object.keys(schema.defaults), ...Object.keys(schema.current)])].sort();
    return keys.map((key) => {
      const value = key in schema.current ? schema.current[key] : schema.defaults[key];
      const kind: FieldKind =
        typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : typeof value === "string" ? "string" : "json";
      return { key, value, kind };
    });
  }

  function fieldId(homeId: string, plugin: string, key: string): string {
    return `${homeId}/${plugin}/${key}`;
  }

  async function loadCairnSettings(): Promise<void> {
    const [theme, deprecated, autoUpdate, autostart, consoleMirror] = await Promise.all([
      cairn.getConfig("cairn", "theme"),
      cairn.getConfig("cairn", "showDeprecated"),
      cairn.getConfig("cairn", "autoUpdateDefault"),
      cairn.getConfig("cairn", "proxyAutostart"),
      cairn.getConfig("settings", "logConsole"),
    ]);
    themeSetting = theme.ok && (theme.data === "light" || theme.data === "dark" || theme.data === "system") ? theme.data : "system";
    showDeprecated = !(deprecated.ok && deprecated.data === false);
    autoUpdateDefault = !(autoUpdate.ok && autoUpdate.data === false);
    proxyAutostart = autostart.ok && autostart.data === true;
    logConsole = consoleMirror.ok && consoleMirror.data === true;
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

  async function handleLogConsoleChange(on: boolean): Promise<void> {
    logConsole = on;
    await cairn.setConfig("settings", "logConsole", on);
  }

  async function handleFieldChange(homeId: string, plugin: string, key: string, value: unknown): Promise<void> {
    const id = fieldId(homeId, plugin, key);
    const result = await cairn.configWrite(homeId, plugin, key, value);
    if (result.ok) {
      fieldError = { ...fieldError, [id]: "" };
      fieldSaved = { ...fieldSaved, [id]: true };
      schemasByHome = {
        ...schemasByHome,
        [homeId]: (schemasByHome[homeId] ?? []).map((s) =>
          s.plugin === plugin ? { ...s, current: { ...s.current, [key]: value } } : s,
        ),
      };
    } else {
      fieldSaved = { ...fieldSaved, [id]: false };
      fieldError = { ...fieldError, [id]: result.error };
    }
  }

  onMount(() => {
    loadCairnSettings();
    loadAppGroups();
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
  <Card>
    <div class="row">
      <div class="info">
        <b>Mirror plugin logs to the console</b>
        <span class="desc">Every plugin's log lines also print to stderr.</span>
      </div>
      <ToggleSwitch checked={logConsole} label="Mirror plugin logs to the console" onchange={handleLogConsoleChange} />
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
        {#each schemasByHome[group.home.id] ?? [] as schema (schema.plugin)}
          <details class="plugin">
            <summary>{schema.plugin}</summary>
            <div class="fields">
              {#each fieldsFor(schema) as field (field.key)}
                {@const id = fieldId(group.home.id, schema.plugin, field.key)}
                <div class="field">
                  <span class="key">{field.key}</span>
                  {#if field.kind === "boolean"}
                    <ToggleSwitch
                      checked={field.value as boolean}
                      label={`${schema.plugin} ${field.key}`}
                      onchange={(on) => handleFieldChange(group.home.id, schema.plugin, field.key, on)}
                    />
                  {:else if field.kind === "number"}
                    <input
                      type="number"
                      aria-label={`${schema.plugin} ${field.key}`}
                      value={field.value as number}
                      onchange={(event) =>
                        handleFieldChange(group.home.id, schema.plugin, field.key, Number((event.currentTarget as HTMLInputElement).value))}
                    />
                  {:else if field.kind === "string"}
                    <input
                      type="text"
                      aria-label={`${schema.plugin} ${field.key}`}
                      value={field.value as string}
                      onchange={(event) =>
                        handleFieldChange(group.home.id, schema.plugin, field.key, (event.currentTarget as HTMLInputElement).value)}
                    />
                  {:else}
                    <pre class="json">{JSON.stringify(field.value, null, 2)}</pre>
                  {/if}
                  {#if fieldError[id]}
                    <span class="fielderror">{fieldError[id]}</span>
                  {:else if fieldSaved[id]}
                    <span class="fieldsaved">Saved</span>
                  {/if}
                </div>
              {/each}
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
  .field {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .field .key {
    flex: 1;
    min-width: 0;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--muted);
  }
  .field input[type="text"],
  .field input[type="number"] {
    font-family: var(--ui);
    font-size: 12.5px;
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    width: 160px;
  }
  .field .json {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--faint);
    background: var(--surface-2);
    border-radius: 7px;
    padding: 6px 9px;
    max-width: 260px;
    overflow: auto;
  }
  .fielderror {
    color: var(--crit);
    font-size: 11px;
  }
  .fieldsaved {
    color: var(--good);
    font-size: 11px;
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
