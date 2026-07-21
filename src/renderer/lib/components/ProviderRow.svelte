<script lang="ts">
  import StatusPill from "./StatusPill.svelte";
  import type { StatusVariant } from "./StatusPill.svelte";
  import AppPills from "./AppPills.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";

  let {
    avatar,
    name,
    subtitle,
    status,
    cc,
    oc,
    accountLabel,
    enabled,
    onToggle,
    onToggleCc,
    onToggleOc,
  }: {
    avatar: string;
    name: string;
    subtitle: string;
    status: { variant: StatusVariant; label: string };
    cc: boolean;
    oc: boolean;
    accountLabel: string;
    enabled: boolean;
    onToggle?: (on: boolean) => void;
    onToggleCc?: (on: boolean) => void;
    onToggleOc?: (on: boolean) => void;
  } = $props();
</script>

<div class="row">
  <div class="mono-ic">{avatar}</div>
  <div class="pname">
    <b>{name}</b>
    <span>{subtitle}</span>
  </div>
  <div><StatusPill variant={status.variant} label={status.label} /></div>
  <AppPills {cc} {oc} {onToggleCc} {onToggleOc} />
  <div class="acct">{accountLabel}</div>
  <ToggleSwitch checked={enabled} label={`${name} enabled`} onchange={onToggle} />
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 34px minmax(150px, 1.4fr) 118px 96px 110px 46px;
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
  .mono-ic {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 13px;
    color: var(--muted);
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
  .acct {
    color: var(--muted);
    font-size: 12px;
  }
</style>
