<script lang="ts">
  import Button from "../../lib/components/Button.svelte";
  import CollapsibleGroup from "../../lib/components/CollapsibleGroup.svelte";
  import EmptyState from "../../lib/components/EmptyState.svelte";
  import ErrorState from "../../lib/components/ErrorState.svelte";
  import PageHeader from "../../lib/components/PageHeader.svelte";
  import StatCard from "../../lib/components/StatCard.svelte";
  import StatusPill from "../../lib/components/StatusPill.svelte";
  import Specimen from "../Specimen.svelte";
  import { LOREM } from "../fixtures.js";

  const noop = (): void => {};
</script>

<div class="stack">
  <Specimen label="PageHeader" wide>
    <PageHeader title="Plugins" subtitle="Installed across every app home">
      {#snippet actions()}
        <Button>Refresh</Button>
        <Button variant="primary">Add plugin</Button>
      {/snippet}
    </PageHeader>
  </Specimen>

  <Specimen label="StatCard" wide>
    <div class="stats">
      <StatCard label="Providers" value="4" meta="all healthy" />
      <StatCard label="Accounts" value="12" unit="signed in" meta="1 quota low" metaColor="var(--warn)" />
      <StatCard label="Requests" value="1,284" unit="today" />
      <StatCard label="Plugins" value="9" meta="2 updates" />
    </div>
  </Specimen>

  <Specimen label="CollapsibleGroup" wide>
    <CollapsibleGroup label="Antigravity" count={3}>
      {#snippet body()}
        <p class="body">{LOREM}</p>
      {/snippet}
    </CollapsibleGroup>
    <CollapsibleGroup label="Collapsed" count={0} open={false}>
      {#snippet body()}
        <p class="body">hidden</p>
      {/snippet}
    </CollapsibleGroup>
  </Specimen>

  <Specimen label="EmptyState / ErrorState" wide>
    <EmptyState message="No plugins match your filters." actionLabel="Clear filters" onAction={noop} />
    <ErrorState message="Could not reach the marketplace." onRetry={noop} />
  </Specimen>

  <Specimen label="Status colours on surface">
    <StatusPill variant="good" label="Running" />
    <StatusPill variant="warn" label="Degraded" />
    <StatusPill variant="off" label="Stopped" />
  </Specimen>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 10px;
    width: 100%;
  }
  .body {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
