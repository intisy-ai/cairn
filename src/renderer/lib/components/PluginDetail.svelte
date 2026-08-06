<script lang="ts">
  import { onMount } from "svelte";
  import type { UnifiedPlugin, PluginConfigSchema, PluginVersion } from "@cairn/shared";
  import PluginControls from "./PluginControls.svelte";
  import RepoDetail from "./RepoDetail.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import SplitButton from "./SplitButton.svelte";
  import PluginIcon, { LOGO_SIZE } from "./PluginIcon.svelte";
  import PluginInstallControl from "./PluginInstallControl.svelte";
  import { cairn } from "../ipc.js";
  import { activeByPluginHome, jobKey, cancelRow, type DownloadRow } from "../downloads.js";

  let {
    plugin,
    homes,
    brokenHomes = [],
    activity = null,
    onClose,
    onInstallAll,
    onRemoveEverywhere,
    onUpdate,
    onRepairHome,
    onUpdateHome,
    onToggleHome,
    onToggleFavorite,
    onChanged,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string; hasUpdater?: boolean }[];
    // Homes where the plugin is installed but only partly built.
    brokenHomes?: string[];
    activity?: import("../downloads.js").DownloadRow | null;
    onClose: () => void;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onUpdate: () => void;
    onRepairHome?: (homeId: string) => void;
    onUpdateHome: (homeId: string) => Promise<void>;
    onToggleHome: (homeId: string, on: boolean) => void;
    onToggleFavorite?: () => void;
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
  // Updates are only actionable where an updater manages this plugin.
  const updatesEnabled = $derived(homes.some((h) => h.hasUpdater));

  let versions = $state<Record<string, PluginVersion>>({});
  const representativeVersion = $derived(
    installedHomes.map((h) => versions[h.id]?.label).find((v): v is string => !!v) ?? "",
  );
  const behindHomes = $derived(
    installedHomes.filter((h) => h.hasUpdater && versions[h.id]?.updateState === "behind").map((h) => h.id),
  );

  // A home's own live job, so a row can say "queued here, installing there" instead of
  // sharing one busy flag across every home.
  function jobFor(homeId: string): DownloadRow | undefined {
    return $activeByPluginHome[jobKey(plugin.name, homeId)];
  }

  function jobLabel(row: DownloadRow | undefined): string {
    if (!row) return "";
    if (row.status === "pending") return "queued";
    if (row.status === "cancelling") return "cancelling";
    return row.label.startsWith("Update") ? "updating" : "installing";
  }

  function checkedLabel(checkedAt: string | null | undefined): string {
    if (!checkedAt) return "never checked for updates";
    return `last checked ${new Date(checkedAt).toLocaleString()}`;
  }

  async function loadVersions(): Promise<void> {
    const result = await cairn.pluginVersions(plugin.name);
    if (result.ok) versions = result.data;
  }

  async function updateHome(homeId: string): Promise<void> {
    await onUpdateHome(homeId);
    await loadVersions();
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

  let activeTab = $state("readme");
  let controlsHome = $state<string>("");
  let controlsSchema = $state<PluginConfigSchema | null>(null);
  let controlsLoading = $state(false);

  $effect(() => {
    if (installedHomes.length > 0 && !installedHomes.some((h) => h.id === controlsHome)) {
      controlsHome = installedHomes[0].id;
    }
  });

  // Resolving a plugin's settings runs its bundle, so the fetch waits until Configure is
  // the tab actually being shown.
  $effect(() => {
    const home = controlsHome;
    const name = plugin.name;
    if (activeTab !== "configure") return;
    if (!home) { controlsSchema = null; return; }
    controlsLoading = true;
    cairn.configSchemas(home).then((result) => {
      if (controlsHome !== home) return;
      controlsSchema = result.ok ? (result.data.find((s) => s.plugin === name) ?? null) : null;
      controlsLoading = false;
    });
  });

</script>

{#snippet topActions()}
  {#if onToggleFavorite}
    <button
      type="button"
      class="favorite"
      class:on={plugin.favorite}
      title={plugin.favorite ? "Unfavorite" : "Favorite"}
      aria-label={plugin.favorite ? "Unfavorite" : "Favorite"}
      onclick={onToggleFavorite}
    >
      {plugin.favorite ? "★" : "☆"}
    </button>
  {/if}
  <PluginInstallControl
    {plugin}
    {homes}
    {activity}
    updateAvailable={plugin.updateAvailable}
    {updatesEnabled}
    {behindHomes}
    {brokenHomes}
    {onRepairHome}
    {onUpdate}
    onUpdateHome={(homeId) => updateHome(homeId)}
    {onInstallAll}
    {onRemoveEverywhere}
    {onToggleHome}
  />
{/snippet}

{#snippet content(active: string)}
  {#if active === "availability"}
    <div>
      <p class="label">Installed in {installedCount}/{homes.length}</p>
      <ul class="apps">
        {#each homes as h (h.id)}
          {@const on = !!plugin.homes[h.id]?.installed}
          <li>
            <span class="appmark" class:na={!on}>
              <PluginIcon icon={h.icon} name={h.label} size={LOGO_SIZE.compact} />
            </span>
            <span class="appname">{h.label}</span>
            {#if on && versions[h.id]}
              {@const v = versions[h.id]}
              <span class="ver">
                <span class="src">{v?.kind}</span>
                {#if v?.label}<span class="num">{v.label}</span>{:else}<span class="num unknown">unknown</span>{/if}
              </span>
              {#if v?.kind === "git" && h.hasUpdater}
                <label class="auto" title="Auto-update on launch">
                  <ToggleSwitch checked={v.autoUpdate} label={`Auto-update ${h.label}`} onchange={(o) => setAutoUpdate(h.id, o)} />
                </label>
              {/if}
            {:else}
              <span class="state">{on ? "Installed" : "Not installed"}</span>
            {/if}
            {#if on && behindHomes.includes(h.id)}
              <span class="behind" data-testid={`behind-${h.id}`}>update available</span>
            {/if}
            {#if on && versions[h.id]?.updateState === "unknown"}
              <span class="unknown" title={checkedLabel(versions[h.id]?.checkedAt)}>update state unknown</span>
            {/if}
            <!-- One control per home. What it offers depends on that home's real state: the
                 work it is doing, an update it is behind on, or nothing but removal. -->
            {#if jobFor(h.id)}
              {@const running = jobFor(h.id)}
              <span class="jobstate" data-testid={`job-${h.id}`}>{jobLabel(running)}</span>
              <SplitButton
                label={jobLabel(running)}
                progress={running && running.percent >= 0 ? running.percent : -1}
                title={running?.step}
              >
                {#snippet menu()}
                  <button onclick={() => running && cancelRow(running)} disabled={!running?.cancellable}>Cancel</button>
                {/snippet}
              </SplitButton>
            {:else if on && behindHomes.includes(h.id)}
              <SplitButton label="Update" title="An update is available for this home" onPrimary={() => updateHome(h.id)}>
                {#snippet menu()}
                  <button onclick={() => onToggleHome(h.id, false)}>Remove</button>
                {/snippet}
              </SplitButton>
            {:else if on}
              <SplitButton label="Remove" danger onPrimary={() => onToggleHome(h.id, false)}>
                {#snippet menu()}
                  <button onclick={() => updateHome(h.id)}>Reinstall</button>
                {/snippet}
              </SplitButton>
            {:else}
              <SplitButton label="Install" onPrimary={() => onToggleHome(h.id, true)} />
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

<RepoDetail {repo} {onClose} {tabs} tabContent={content} actions={topActions} versionLabel={representativeVersion} onTab={(id) => (activeTab = id)} />

<style>
  .jobstate {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--accent);
  }
  .unknown {
    font-size: 11px;
    color: var(--warn);
  }
  .behind {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--accent);
    padding: 1px 6px;
    border: 1px solid var(--accent-border);
    border-radius: 999px;
    background: var(--accent-weak);
  }
  .favorite {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--muted);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    flex: none;
  }
  .favorite:hover {
    color: var(--text);
    border-color: var(--faint);
    background: var(--surface-2);
  }
  .favorite.on {
    color: #e3b341;
  }
  .favorite:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
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
    border-radius: 6px;
    overflow: hidden;
    flex: none;
    display: inline-flex;
  }
  .appmark.na {
    filter: grayscale(0.85);
    opacity: 0.45;
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
  .ver .num.unknown {
    font-style: italic;
    color: var(--faint);
  }
  .auto {
    display: inline-flex;
    align-items: center;
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
