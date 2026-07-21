<script lang="ts">
  import { onMount } from "svelte";
  import type { UsageSnapshot } from "@dashboard/shared";
  import { intisy } from "../ipc.js";
  import StatCard from "../components/StatCard.svelte";
  import Sparkline from "../components/Sparkline.svelte";
  import Card from "../components/Card.svelte";

  let snapshot = $state<UsageSnapshot | null>(null);
  let loadError = $state("");

  const providerCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const account of snapshot?.accounts ?? []) {
      counts.set(account.provider, (counts.get(account.provider) ?? 0) + 1);
    }
    return [...counts.entries()];
  });

  function formatUpdatedAt(value: string): string {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
  }

  onMount(async () => {
    const result = await intisy.usageSnapshot();
    if (result.ok) snapshot = result.data;
    else loadError = result.error;
  });
</script>

<div class="head">
  <div>
    <h1>Usage</h1>
    <p>Account coverage across providers. Session and cost analytics land once the metrics backend is migrated off metric-dashboard.</p>
  </div>
</div>

{#if loadError}
  <p class="error">Could not load usage: {loadError}</p>
{:else if snapshot}
  <section class="summary">
    <StatCard label="Accounts tracked" value={String(snapshot.accounts.length)} />
    <StatCard label="Providers" value={String(providerCounts.length)} />
    <StatCard label="Last updated" value={formatUpdatedAt(snapshot.updatedAt)} />
    <StatCard label="Activity" value="n/a" meta="No session data yet">
      {#snippet spark()}<Sparkline data={[]} />{/snippet}
    </StatCard>
  </section>

  <section class="group">
    <div class="grouphead">
      <p class="label">Accounts by provider</p>
      <span class="count">{snapshot.accounts.length}</span>
      <span class="line"></span>
    </div>
    <Card>
      <div class="list">
        {#each providerCounts as [provider, count] (provider)}
          <div class="provider-row">
            <span class="provider">{provider}</span>
            <span class="num">{count} account{count === 1 ? "" : "s"}</span>
          </div>
        {:else}
          <p class="empty">No accounts yet</p>
        {/each}
      </div>
    </Card>
  </section>

  <section class="group">
    <div class="grouphead">
      <p class="label">Sessions</p>
      <span class="line"></span>
    </div>
    <Card>
      <p class="empty">
        Detailed session and cost data arrives once the metrics backend is migrated off metric-dashboard.
      </p>
    </Card>
  </section>
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
    max-width: 560px;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 22px;
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
  .list {
    padding: 4px 16px;
  }
  .provider-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .provider-row:first-child {
    border-top: 0;
  }
  .provider-row .provider {
    font-weight: 600;
    font-size: 13px;
    text-transform: capitalize;
  }
  .provider-row .num {
    color: var(--faint);
    font-size: 11.5px;
    font-family: var(--mono);
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 14px 16px;
    margin: 0;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
