<script lang="ts">
  import { onMount } from "svelte";
  import type { OverviewSummary } from "@dashboard/shared";
  import { intisy } from "../ipc.js";
  import StatCard from "../components/StatCard.svelte";

  let summary = $state<OverviewSummary | null>(null);
  let loadError = $state("");

  onMount(async () => {
    const result = await intisy.overviewSummary();
    if (result.ok) summary = result.data;
    else loadError = result.error;
  });
</script>

<div class="head">
  <div>
    <h1>Overview</h1>
    <p>A snapshot of your providers, accounts, and local API.</p>
  </div>
</div>

{#if loadError}
  <p class="error">Could not load the overview: {loadError}</p>
{:else if summary}
  <section class="summary">
    <StatCard label="Providers connected" value={String(summary.providersConnected)} />
    <StatCard label="Accounts" value={String(summary.accountsTotal)} />
    <StatCard
      label="Local API"
      value={summary.serverRunning ? "Running" : "Stopped"}
      meta={`Port ${summary.serverPort}`}
      metaColor={summary.serverRunning ? "var(--good)" : "var(--faint)"}
    />
    <StatCard label="Port" value={String(summary.serverPort)} meta="local proxy" />
  </section>
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }
  .head h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: -.01em;
  }
  .head p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
