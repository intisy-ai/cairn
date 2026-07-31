<script lang="ts">
  import type { UnifiedPlugin, PluginConfigSchema } from "@cairn/shared";
  import Button from "./Button.svelte";
  import PluginControls from "./PluginControls.svelte";
  import RepoDetail from "./RepoDetail.svelte";
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
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    mandatory?: boolean;
    onClose: () => void;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onUpdate: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
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

<RepoDetail {repo} {onClose}>
  {#snippet extra()}
    {#if mandatory || plugin.updateAvailable}
      <div class="badges">
        {#if mandatory}<span class="badge locked" title="Mandatory engine">Locked</span>{/if}
        {#if plugin.updateAvailable}<span class="badge update">Update available</span>{/if}
      </div>
    {/if}

    <section class="deploy">
      <p class="label">Availability {installedCount}/{homes.length}</p>
      <ul class="apps">
        {#each homes as h (h.id)}
          {@const on = !!plugin.homes[h.id]?.installed}
          {@const icon = h.icon}
          <li>
            <span class="appmark" class:na={!on}>
              {#if icon}<span class="glyph">{@html icon}</span>{:else}<span class="lm">{letters(h.label)}</span>{/if}
            </span>
            <span class="appname">{h.label}</span>
            <span class="state">{on ? "Installed" : "Not installed"}</span>
            {#if mandatory}
              <span class="toggle locked" title="Mandatory engine">Locked</span>
            {:else}
              <button class="toggle" class:on onclick={() => onToggleHome(h.id, !on)}>{on ? "Remove" : "Install"}</button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    {#if installedHomes.length > 0}
      <section class="controls">
        <p class="label">Controls</p>
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
          <p class="cmuted">No controls.</p>
        {/if}
      </section>
    {/if}
  {/snippet}

  {#snippet actions()}
    {#if plugin.updateAvailable}
      <Button onclick={onUpdate}>Update</Button>
    {/if}
    {#if !fullyInstalled}
      <Button variant="primary" onclick={onInstallAll}>Install everywhere</Button>
    {/if}
    {#if installedCount > 0 && !mandatory}
      <Button onclick={onRemoveEverywhere}>Remove everywhere</Button>
    {/if}
  {/snippet}
</RepoDetail>

<style>
  .badges {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .badge {
    font-size: 10.5px;
    font-weight: 600;
    border-radius: 20px;
    padding: 2px 9px;
  }
  .badge.update {
    color: var(--accent);
    background: var(--accent-weak);
  }
  .badge.locked {
    color: var(--faint);
    background: var(--surface-2);
  }
  .label {
    margin: 0 0 8px;
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
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
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
    gap: 10px;
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
