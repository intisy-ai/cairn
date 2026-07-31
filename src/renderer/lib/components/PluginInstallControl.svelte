<script lang="ts">
  import type { UnifiedPlugin } from "@cairn/shared";
  import SplitButton from "./SplitButton.svelte";

  let {
    plugin,
    homes,
    mandatory = false,
    block = false,
    onInstallAll,
    onRemoveEverywhere,
    onToggleHome,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    mandatory?: boolean;
    block?: boolean;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
  } = $props();

  const installedCount = $derived(homes.filter((h) => plugin.homes[h.id]?.installed).length);
  const fullyInstalled = $derived(installedCount === homes.length && homes.length > 0);
  const remainingCount = $derived(homes.length - installedCount);
  const canRemove = $derived(!mandatory);
  const isRemoveAll = $derived(fullyInstalled && canRemove);
  const primaryLabel = $derived(
    isRemoveAll ? "Remove everywhere" : installedCount === 0 ? "Install everywhere" : `Install in ${remainingCount}`,
  );
</script>

{#snippet menu()}
  <div class="imenu">
    {#each homes as h (h.id)}
      {@const on = !!plugin.homes[h.id]?.installed}
      {#if on}
        {#if canRemove}
          <button class="mrow danger" onclick={() => onToggleHome(h.id, false)}>Remove from {h.label}</button>
        {/if}
      {:else}
        <button class="mrow" onclick={() => onToggleHome(h.id, true)}>Install in {h.label}</button>
      {/if}
    {/each}
    {#if canRemove && installedCount > 0 && !fullyInstalled}
      <button class="mrow danger" onclick={onRemoveEverywhere}>Remove everywhere</button>
    {/if}
  </div>
{/snippet}

{#if !(mandatory && fullyInstalled)}
  <SplitButton
    label={primaryLabel}
    danger={isRemoveAll}
    {block}
    onPrimary={() => (isRemoveAll ? onRemoveEverywhere() : onInstallAll())}
    {menu}
  />
{/if}

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
  .mrow:hover {
    background: var(--surface-2);
  }
  .mrow.danger {
    color: var(--crit);
  }
</style>
