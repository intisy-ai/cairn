<script lang="ts">
  import StatusPill from "./StatusPill.svelte";
  import type { StatusVariant } from "./StatusPill.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";

  let {
    label,
    detail = "",
    status,
    enabled,
    onToggle,
  }: {
    label: string;
    detail?: string;
    status: { variant: StatusVariant; label: string };
    enabled: boolean;
    onToggle?: (on: boolean) => void;
  } = $props();
</script>

<div class="row">
  <div class="pname">
    <b>{label}</b>
    {#if detail}<span>{detail}</span>{/if}
  </div>
  <div><StatusPill variant={status.variant} label={status.label} /></div>
  <ToggleSwitch checked={enabled} label={`${label} enabled`} onchange={onToggle} />
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(150px, 1.4fr) 118px 46px;
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
</style>
