<script lang="ts">
  import type { AccountQuota } from "@cairn/shared";
  import StatusPill from "./StatusPill.svelte";
  import type { StatusVariant } from "./StatusPill.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import Button from "./Button.svelte";

  const QUOTA_CHIP_CAP = 3;
  const WARN_THRESHOLD = 0.8;

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

  function percentUsed(remainingFraction: number): number {
    const used = Math.max(0, Math.min(1, 1 - remainingFraction));
    return Math.round(used * 100);
  }

  const visibleQuota = $derived(quota.slice(0, QUOTA_CHIP_CAP));
  const hiddenQuotaCount = $derived(Math.max(0, quota.length - QUOTA_CHIP_CAP));
</script>

<div class="row">
  <div class="pname">
    <b>{label}</b>
    {#if detail}<span>{detail}</span>{/if}
  </div>
  <div><StatusPill variant={status.variant} label={status.label} /></div>
  <div class="quotas">
    {#each visibleQuota as q, i (q.label ?? `quota-${i}`)}
      {@const pct = percentUsed(q.remainingFraction ?? 1)}
      <span
        class="qchip"
        class:warn={pct / 100 >= WARN_THRESHOLD}
        title={q.label ? `${q.label}: ${pct}% used` : `${pct}% used`}
      >
        {#if q.label}<span class="qlabel">{q.label}</span>{/if}
        <span class="qpct">{pct}%</span>
      </span>
    {:else}
      <span class="none">No quota data</span>
    {/each}
    {#if hiddenQuotaCount > 0}
      <span class="qmore">+{hiddenQuotaCount}</span>
    {/if}
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
    flex-wrap: nowrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }
  .qchip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--good);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 2px 8px;
    white-space: nowrap;
  }
  .qchip.warn {
    color: var(--warn);
  }
  .qlabel {
    color: var(--muted);
  }
  .qpct {
    font-weight: 600;
  }
  .qmore {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--faint);
  }
  .none {
    font-size: 11.5px;
    color: var(--faint);
  }
</style>
