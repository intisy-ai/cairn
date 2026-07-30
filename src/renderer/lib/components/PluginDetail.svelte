<script lang="ts">
  import type { UnifiedPlugin, PluginConfigSchema } from "@cairn/shared";
  import PluginIcon from "./PluginIcon.svelte";
  import Button from "./Button.svelte";
  import PluginControls from "./PluginControls.svelte";
  import { cairn } from "../ipc.js";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  let {
    plugin,
    homes,
    onClose,
    onInstallAll,
    onRemoveEverywhere,
    onUpdate,
    onToggleHome,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    onClose: () => void;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onUpdate: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
  } = $props();

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
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={onClose} transition:fadeMotion></div>
<div class="panel" role="dialog" aria-modal="true" aria-label={`${plugin.displayName} details`} transition:flyMotion={{ y: 10 }}>
  <button class="close" title="Close" aria-label="Close" onclick={onClose}>×</button>

  <header class="hero">
    <PluginIcon icon={plugin.icon} name={plugin.displayName} kind={plugin.kind} size={56} />
    <div class="titles">
      <h2>{plugin.displayName}</h2>
      <div class="sub">
        {#if plugin.displayName !== plugin.name}<span class="repo">{plugin.name}</span>{/if}
        <span class="kind">{plugin.kind}</span>
        {#if plugin.updateAvailable}<span class="update">Update available</span>{/if}
      </div>
    </div>
  </header>

  {#if plugin.description}
    <p class="desc">{plugin.description}</p>
  {/if}

  {#if plugin.topics.length > 0}
    <div class="topics">
      {#each plugin.topics as topic (topic)}<span class="topic">{topic}</span>{/each}
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
          <button class="toggle" class:on onclick={() => onToggleHome(h.id, !on)}>{on ? "Remove" : "Install"}</button>
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

  <footer class="actions">
    {#if plugin.updateAvailable}
      <Button onclick={onUpdate}>Update</Button>
    {/if}
    {#if !fullyInstalled}
      <Button variant="primary" onclick={onInstallAll}>Install everywhere</Button>
    {/if}
    {#if installedCount > 0}
      <Button onclick={onRemoveEverywhere}>Remove everywhere</Button>
    {/if}
  </footer>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .4);
    z-index: 40;
  }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 41;
    width: min(94vw, 440px);
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: var(--shadow);
    padding: 24px 22px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }
  .close {
    position: absolute;
    top: 12px;
    right: 14px;
    background: none;
    border: none;
    color: var(--faint);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .close:hover {
    background: var(--surface-2);
    color: var(--text);
  }
  .hero {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-right: 24px;
  }
  .titles h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -.02em;
  }
  .sub {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    flex-wrap: wrap;
  }
  .repo {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
  }
  .kind {
    font-size: 10px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 20px;
    padding: 2px 8px;
  }
  .update {
    font-size: 10.5px;
    color: var(--accent);
    font-weight: 600;
  }
  .desc {
    margin: 0;
    font-size: 13px;
    color: var(--text);
    line-height: 1.5;
  }
  .topics {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .topic {
    font-size: 10.5px;
    color: var(--faint);
    background: var(--surface-2);
    border-radius: 6px;
    padding: 2px 7px;
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
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
  }
</style>
