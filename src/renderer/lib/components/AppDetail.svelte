<script lang="ts">
  import type { HostApp, AppSummary } from "@cairn/shared";
  import PluginIcon from "./PluginIcon.svelte";
  import Button from "./Button.svelte";
  import Chip from "./Chip.svelte";
  import Spinner from "./Spinner.svelte";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  const PROVIDER_BREAKDOWN_CAP = 6;

  let {
    app,
    summary,
    summaryError,
    canImport,
    busy = false,
    onClose,
    onImport,
    onInit,
    onUninstall,
  }: {
    app: HostApp;
    summary: AppSummary | null;
    summaryError: string;
    canImport: boolean;
    busy?: boolean;
    onClose: () => void;
    onImport: () => void;
    onInit: () => void;
    onUninstall: (wipe: boolean) => void;
  } = $props();

  let confirmingUninstall = $state(false);
  let wipe = $state(false);

  const shownBreakdown = $derived(summary ? summary.providerBreakdown.slice(0, PROVIDER_BREAKDOWN_CAP) : []);
  const moreCount = $derived(summary ? summary.providerBreakdown.length - shownBreakdown.length : 0);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={onClose} transition:fadeMotion></div>
<div class="panel" role="dialog" aria-modal="true" aria-label={`${app.label} details`} transition:flyMotion={{ y: 10 }}>
  <button class="close" title="Close" aria-label="Close" onclick={onClose}>×</button>

  <header class="hero">
    <PluginIcon icon={app.icon} name={app.label} size={56} />
    <div class="titles">
      <h2>{app.label}</h2>
      <div class="sub"><span class="detected">Detected</span></div>
    </div>
  </header>

  {#if summaryError}
    <p class="error">Could not load app summary: {summaryError}</p>
  {:else if summary}
    <section>
      <p class="label">Snapshot</p>
      <div class="stats">
        <div class="stat" data-testid="stat-accounts"><span class="v">{summary.accounts.length}</span><span class="k">accounts</span></div>
        <div class="stat" data-testid="stat-enabled"><span class="v">{summary.accountsEnabled}</span><span class="k">enabled</span></div>
        <div class="stat" data-testid="stat-providers"><span class="v">{summary.providerCount}</span><span class="k">providers</span></div>
        <div class="stat" data-testid="stat-plugins"><span class="v">{summary.pluginCount}</span><span class="k">plugins</span></div>
        {#if summary.routingSlots !== null}
          <div class="stat" data-testid="stat-routing"><span class="v">{summary.routingSlots}</span><span class="k">routing slots</span></div>
        {/if}
        {#if summary.quotaMinPct !== null}
          <div class="stat" data-testid="stat-quota"><span class="v">{summary.quotaMinPct}%</span><span class="k">lowest quota</span></div>
        {/if}
      </div>
    </section>

    <section>
      <p class="label">Providers</p>
      {#if shownBreakdown.length > 0}
        <div class="breakdown">
          {#each shownBreakdown as agg}
            <Chip label={`${agg.provider} · ${agg.enabled}/${agg.accounts}`} />
          {/each}
          {#if moreCount > 0}<span class="more">+{moreCount} more</span>{/if}
        </div>
      {:else}
        <p class="muted">No accounts connected.</p>
      {/if}
    </section>

    <section>
      <p class="label">Config directory</p>
      <p class="path">{summary.configDir}</p>
    </section>
  {:else}
    <p class="muted">Loading summary…</p>
  {/if}

  <footer class="actions">
    {#if canImport}
      <Button onclick={onImport}>Import config</Button>
    {/if}
    <Button disabled={busy} onclick={onInit}>
      {#if busy}<Spinner />{/if}
      Initialize plugin-updater
    </Button>
  </footer>

  <section class="dangerzone">
    {#if !confirmingUninstall}
      <Button variant="danger" onclick={() => { confirmingUninstall = true; wipe = false; }}>Uninstall app</Button>
    {:else}
      <div class="dangerpanel">
        <p>This removes the {app.label} CLI from this machine. Plugins and configuration stay in place unless you also delete data.</p>
        <label class="wipe">
          <input type="checkbox" checked={wipe} onchange={(event) => (wipe = event.currentTarget.checked)} />
          Also delete all data
        </label>
        <div class="actions">
          <Button onclick={() => (confirmingUninstall = false)}>Cancel</Button>
          <Button variant="danger" onclick={() => onUninstall(wipe)}>Uninstall</Button>
        </div>
      </div>
    {/if}
  </section>
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
    margin-top: 4px;
  }
  .detected {
    font-size: 10.5px;
    color: var(--good);
    font-weight: 600;
  }
  .label {
    margin: 0 0 8px;
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
    gap: 8px;
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 9px;
  }
  .stat .v {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: -.02em;
    font-variant-numeric: tabular-nums;
  }
  .stat .k {
    font-size: 10.5px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .more {
    font-size: 11.5px;
    color: var(--faint);
    padding: 4px 10px;
  }
  .path {
    margin: 0;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
    overflow-wrap: anywhere;
  }
  .muted {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
  .error {
    color: var(--crit);
    font-size: 12.5px;
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .dangerzone {
    margin-top: auto;
    padding-top: 8px;
  }
  .dangerpanel {
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
