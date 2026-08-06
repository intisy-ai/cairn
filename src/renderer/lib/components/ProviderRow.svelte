<script lang="ts">
  import type { HostApp } from "@cairn/shared";
  import StatusPill from "./StatusPill.svelte";
  import type { StatusVariant } from "./StatusPill.svelte";
  import AppPills from "./AppPills.svelte";
  import PluginIcon, { LOGO_SIZE } from "./PluginIcon.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import Chip from "./Chip.svelte";

  let {
    name,
    subtitle,
    translator,
    status,
    apps,
    exposure,
    accountLabel,
    enabled,
    onToggle,
    onToggleExposure,
    onOpen,
  }: {
    name: string;
    subtitle: string;
    translator?: string;
    status: { variant: StatusVariant; label: string };
    apps: HostApp[];
    exposure: Record<string, boolean>;
    accountLabel: string;
    enabled: boolean;
    onToggle?: (on: boolean) => void;
    onToggleExposure?: (appId: string, on: boolean) => void;
    onOpen?: () => void;
  } = $props();

  function onKeydown(event: KeyboardEvent): void {
    if (!onOpen) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  }
</script>

<!-- role/tabindex are only applied when onOpen makes the row genuinely interactive -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="row"
  role={onOpen ? "button" : undefined}
  tabindex={onOpen ? 0 : undefined}
  onclick={onOpen}
  onkeydown={onKeydown}
>
  <PluginIcon name={name} kind="provider" size={LOGO_SIZE.list} />
  <div class="pname">
    <b>{name}</b>
    <span>{subtitle}</span>
    {#if translator}<Chip label={translator} />{/if}
  </div>
  <div><StatusPill variant={status.variant} label={status.label} /></div>
  <div class="interactive" onclick={(e) => e.stopPropagation()} role="presentation">
    <AppPills {apps} values={exposure} onToggle={onToggleExposure} />
  </div>
  <div class="acct">{accountLabel}</div>
  <div class="interactive" onclick={(e) => e.stopPropagation()} role="presentation">
    <ToggleSwitch checked={enabled} label={`${name} enabled`} onchange={onToggle} />
  </div>
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
  .row[role="button"] {
    cursor: pointer;
  }
  .row[role="button"]:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .interactive {
    display: contents;
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
