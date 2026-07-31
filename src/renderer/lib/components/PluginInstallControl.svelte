<script lang="ts">
  import type { UnifiedPlugin } from "@cairn/shared";
  import SplitButton from "./SplitButton.svelte";

  let {
    plugin,
    homes,
    block = false,
    canInstallHome,
    onInstallAll,
    onRemoveEverywhere,
    onToggleHome,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    block?: boolean;
    canInstallHome?: (homeId: string) => boolean;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
  } = $props();

  function allows(homeId: string): boolean {
    return !canInstallHome || canInstallHome(homeId);
  }

  const installedCount = $derived(homes.filter((h) => plugin.homes[h.id]?.installed).length);
  const fullyInstalled = $derived(installedCount === homes.length && homes.length > 0);
  const installableRemainingHomes = $derived(homes.filter((h) => !plugin.homes[h.id]?.installed && allows(h.id)));
  const isRemoveAll = $derived(fullyInstalled);
  const primaryDisabled = $derived(!isRemoveAll && installableRemainingHomes.length === 0);
  const primaryLabel = $derived(
    isRemoveAll
      ? "Remove everywhere"
      : installableRemainingHomes.length === 1
        ? `Install in ${installableRemainingHomes[0].label}`
        : installedCount === 0 && installableRemainingHomes.length === homes.length
          ? "Install everywhere"
          : `Install in ${installableRemainingHomes.length}`,
  );
</script>

{#snippet menu()}
  <div class="imenu">
    {#each homes as h (h.id)}
      {@const on = !!plugin.homes[h.id]?.installed}
      {#if on}
        <button class="mrow danger" onclick={() => onToggleHome(h.id, false)}>Remove from {h.label}</button>
      {:else if allows(h.id)}
        <button class="mrow" onclick={() => onToggleHome(h.id, true)}>Install in {h.label}</button>
      {:else}
        <button class="mrow" disabled title="Install plugin-updater in this app first">Install in {h.label}</button>
      {/if}
    {/each}
    {#if installedCount > 0 && !fullyInstalled}
      <button class="mrow danger" onclick={onRemoveEverywhere}>Remove everywhere</button>
    {/if}
  </div>
{/snippet}

<SplitButton
  label={primaryLabel}
  danger={isRemoveAll}
  disabled={primaryDisabled}
  title={primaryDisabled ? "Install plugin-updater in an app first" : undefined}
  {block}
  onPrimary={() => (isRemoveAll ? onRemoveEverywhere() : onInstallAll())}
  {menu}
/>

<style>
  .imenu {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mrow {
    text-align: left;
    background: none;
    border: none;
    border-radius: 7px;
    padding: 7px 10px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .mrow:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .mrow.danger {
    color: var(--crit);
  }
  .mrow:disabled {
    color: var(--faint);
    cursor: default;
  }
</style>
