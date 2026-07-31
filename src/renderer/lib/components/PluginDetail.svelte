<script lang="ts">
  import { onMount } from "svelte";
  import type { UnifiedPlugin, PluginConfigSchema, PluginVersion } from "@cairn/shared";
  import PluginControls from "./PluginControls.svelte";
  import RepoDetail from "./RepoDetail.svelte";
  import IconButton from "./IconButton.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import { cairn } from "../ipc.js";

  let {
    plugin,
    homes,
    mandatory = false,
    onClose,
    onInstallAll,
    onRemoveEverywhere,
    onUpdate,
    onToggleHome,
    onChanged,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    mandatory?: boolean;
    onClose: () => void;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onUpdate: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
    onChanged?: () => void;
  } = $props();

  const repo = $derived({
    name: plugin.name,
    url: plugin.url ?? "",
    kind: plugin.kind,
    description: plugin.description,
    topics: plugin.topics,
    displayName: plugin.displayName,
    icon: plugin.icon,
  });

  const installedCount = $derived(homes.filter((h) => plugin.homes[h.id]?.installed).length);
  const fullyInstalled = $derived(installedCount === homes.length && homes.length > 0);
  const installedHomes = $derived(homes.filter((h) => plugin.homes[h.id]?.installed));

  let versions = $state<Record<string, PluginVersion>>({});
  const representativeVersion = $derived(
    installedHomes.map((h) => versions[h.id]?.label).find((v): v is string => !!v) ?? "",
  );

  let busyHome = $state<Record<string, boolean>>({});

  async function loadVersions(): Promise<void> {
    const result = await cairn.pluginVersions(plugin.name);
    if (result.ok) versions = result.data;
  }

  async function updateHome(homeId: string): Promise<void> {
    if (busyHome[homeId]) return;
    busyHome = { ...busyHome, [homeId]: true };
    try {
      await cairn.pluginsInstall(homeId, plugin.name, plugin.url ?? "");
      await loadVersions();
      onChanged?.();
    } finally {
      busyHome = { ...busyHome, [homeId]: false };
    }
  }

  async function setAutoUpdate(homeId: string, on: boolean): Promise<void> {
    const current = versions[homeId];
    if (current) versions = { ...versions, [homeId]: { ...current, autoUpdate: on } };
    await cairn.pluginsSetAutoUpdate(homeId, plugin.name, on);
    onChanged?.();
  }

  onMount(loadVersions);

  const tabs = $derived([
    { id: "availability", label: "Availability" },
    ...(installedHomes.length > 0 ? [{ id: "configure", label: "Configure" }] : []),
  ]);

  let controlsHome = $state<string>("");
  let controlsSchema = $state<PluginConfigSchema | null>(null);
  let controlsLoading = $state(false);

  $effect(() => {
    if (installedHomes.length > 0 && !installedHomes.some((h) => h.id === controlsHome)) {
      controlsHome = installedHomes[0].id;
    }
  });

  // Fetch the selected home's schema for this plugin on demand.
  $effect(() => {
    const home = controlsHome;
    const name = plugin.name;
    if (!home) { controlsSchema = null; return; }
    controlsLoading = true;
    cairn.configSchemas(home).then((result) => {
      if (controlsHome !== home) return;
      controlsSchema = result.ok ? (result.data.find((s) => s.plugin === name) ?? null) : null;
      controlsLoading = false;
    });
  });

  function letters(label: string): string {
    return label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }
</script>

{#snippet topActions()}
  {#if mandatory}
    <span class="lockbadge" title="Mandatory engine">Locked</span>
  {/if}
  {#if plugin.updateAvailable}
    <IconButton name="refresh" title="Update" onclick={onUpdate} />
  {/if}
  {#if !fullyInstalled}
    <IconButton name="download" title="Install everywhere" onclick={onInstallAll} />
  {/if}
  {#if installedCount > 0 && !mandatory}
    <IconButton name="trash" title="Remove everywhere" danger onclick={onRemoveEverywhere} />
  {/if}
{/snippet}

{#snippet content(active: string)}
  {#if active === "availability"}
    <div>
      <p class="label">Installed in {installedCount}/{homes.length}</p>
      <ul class="apps">
        {#each homes as h (h.id)}
          {@const on = !!plugin.homes[h.id]?.installed}
          {@const icon = h.icon}
          <li>
            <span class="appmark" class:na={!on}>
              {#if icon}<span class="glyph">{@html icon}</span>{:else}<span class="lm">{letters(h.label)}</span>{/if}
            </span>
            <span class="appname">{h.label}</span>
            {#if on && versions[h.id]}
              {@const v = versions[h.id]}
              <span class="ver">
                <span class="src">{v?.kind}</span>
                {#if v?.label}<span class="num">{v.label}</span>{/if}
              </span>
              {#if v?.kind === "git"}
                {#if v.updateAvailable}
                  <button class="mini" disabled={busyHome[h.id]} onclick={() => updateHome(h.id)}>Update</button>
                {/if}
                <label class="auto" title="Auto-update on launch">
                  <ToggleSwitch checked={v.autoUpdate} label={`Auto-update ${h.label}`} onchange={(o) => setAutoUpdate(h.id, o)} />
                </label>
              {/if}
            {:else}
              <span class="state">{on ? "Installed" : "Not installed"}</span>
            {/if}
            {#if mandatory}
              <span class="toggle locked" title="Mandatory engine">Locked</span>
            {:else}
              <button class="toggle" class:on onclick={() => onToggleHome(h.id, !on)}>{on ? "Remove" : "Install"}</button>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {:else if active === "configure"}
    <div class="controls">
      {#if installedHomes.length > 1}
        <div class="homeswitch">
          {#each installedHomes as h (h.id)}
            <button class="hchip" class:on={controlsHome === h.id} onclick={() => (controlsHome = h.id)}>{h.label}</button>
          {/each}
        </div>
      {/if}
      {#if controlsSchema}
        <PluginControls homeId={controlsHome} schema={controlsSchema} />
      {:else if controlsLoading}
        <p class="cmuted">Loading controls…</p>
      {:else}
        <p class="cmuted">This plugin has no configurable settings.</p>
      {/if}
    </div>
  {/if}
{/snippet}

<RepoDetail {repo} {onClose} {tabs} tabContent={content} actions={topActions} versionLabel={representativeVersion} />

<style>
  .lockbadge {
    align-self: center;
    font-size: 10px;
    letter-spacing: .04em;
    text-transform: uppercase;
    font-weight: 600;
    color: var(--faint);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 4px 10px;
  }
  .label {
    margin: 0 0 10px;
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .apps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .apps li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-2);
  }
  .appmark {
    width: 24px;
    height: 24px;
    border-radius: 6px;
    overflow: hidden;
    flex: none;
    display: inline-flex;
  }
  .appmark.na {
    filter: grayscale(0.85);
    opacity: 0.45;
  }
  .appmark .glyph :global(svg) {
    width: 100%;
    height: 100%;
    display: block;
  }
  .lm {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    color: #fff;
    background: var(--faint);
  }
  .appname {
    font-size: 13px;
    font-weight: 500;
    flex: 1;
  }
  .state {
    font-size: 11px;
    color: var(--faint);
  }
  .ver {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--muted);
  }
  .ver .src {
    font-size: 9px;
    letter-spacing: .04em;
    text-transform: uppercase;
    font-weight: 700;
    color: var(--faint);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 1px 5px;
  }
  .ver .num {
    font-family: var(--mono);
  }
  .mini {
    font-size: 11px;
    font-weight: 600;
    border: 1px solid var(--accent-border);
    background: var(--accent-weak);
    color: var(--accent);
    border-radius: 7px;
    padding: 3px 10px;
    cursor: pointer;
  }
  .mini:disabled {
    opacity: .5;
    cursor: default;
  }
  .auto {
    display: inline-flex;
    align-items: center;
  }
  .toggle {
    font-size: 11.5px;
    font-weight: 600;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    border-radius: 7px;
    padding: 4px 12px;
    cursor: pointer;
  }
  .toggle:hover {
    background: var(--surface-2);
  }
  .toggle.on {
    color: var(--crit);
    border-color: var(--crit);
  }
  .toggle.locked {
    color: var(--faint);
    cursor: default;
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .homeswitch {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .hchip {
    font-size: 11.5px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--muted);
    border-radius: 20px;
    padding: 3px 11px;
    cursor: pointer;
  }
  .hchip.on {
    background: var(--accent-weak);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .cmuted {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
</style>
