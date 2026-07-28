<script lang="ts">
  import StatusPill from "./StatusPill.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import Button from "./Button.svelte";

  let {
    name,
    kind,
    installedVersion = null,
    updateAvailable,
    enabled,
    onToggle,
    onUninstall,
    uninstallState = "idle",
    deprecated = false,
  }: {
    name: string;
    kind: "git" | "npm";
    installedVersion?: string | null;
    updateAvailable: boolean;
    enabled: boolean;
    onToggle?: (on: boolean) => void;
    onUninstall?: () => void;
    uninstallState?: "idle" | "confirm";
    deprecated?: boolean;
  } = $props();

  const detail = $derived(installedVersion ? `${kind} · v${installedVersion}` : kind);
</script>

<div class="row" class:has-uninstall={!!onUninstall}>
  <div class="pname">
    <b>{name}</b>
    <span>{detail}</span>
  </div>
  <div>
    {#if deprecated}
      <StatusPill variant="warn" label="Deprecated" />
    {:else if updateAvailable}
      <StatusPill variant="warn" label="Update available" />
    {:else}
      <StatusPill variant="good" label="Up to date" />
    {/if}
  </div>
  <ToggleSwitch checked={enabled} label={`${name} enabled`} onchange={onToggle} />
  {#if onUninstall}
    <Button onclick={onUninstall}>{uninstallState === "confirm" ? "Confirm?" : "Uninstall"}</Button>
  {/if}
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: minmax(150px, 1.4fr) 140px 46px;
    align-items: center;
    gap: 14px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  .row.has-uninstall {
    grid-template-columns: minmax(150px, 1.4fr) 140px 46px auto;
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
