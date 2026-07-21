<script lang="ts">
  import type { AccountQuota } from "@dashboard/shared";
  import StatusPill from "./StatusPill.svelte";
  import type { StatusVariant } from "./StatusPill.svelte";
  import QuotaBar from "./QuotaBar.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import Button from "./Button.svelte";

  let {
    label,
    detail = "",
    status,
    enabled,
    quota = [],
    onToggle,
    onRemove,
  }: {
    label: string;
    detail?: string;
    status: { variant: StatusVariant; label: string };
    enabled: boolean;
    quota?: AccountQuota[];
    onToggle?: (on: boolean) => void;
    onRemove?: () => void;
  } = $props();
</script>

<div class="row">
  <div class="pname">
    <b>{label}</b>
    {#if detail}<span>{detail}</span>{/if}
  </div>
  <div><StatusPill variant={status.variant} label={status.label} /></div>
  <div class="quotas">
    {#each quota as q, i (q.label ?? `quota-${i}`)}
      <QuotaBar label={q.label} remainingFraction={q.remainingFraction ?? 1} />
    {:else}
      <span class="none">No quota data</span>
    {/each}
  </div>
  <ToggleSwitch checked={enabled} label={`${label} enabled`} onchange={onToggle} />
  {#if onRemove}
    <Button onclick={onRemove}>Remove</Button>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(150px, 1.4fr) 118px 150px 46px 80px;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  .row:first-child {
    border-top: 0;
  }
  .row:hover {
    background: var(--surface-2);
  }
  .pname {
    min-width: 0;
  }
  .pname b {
    font-size: 13.5px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .pname span {
    display: block;
    color: var(--faint);
    font-size: 11.5px;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .quotas {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .none {
    font-size: 11.5px;
    color: var(--faint);
  }
</style>
