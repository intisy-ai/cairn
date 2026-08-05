<script lang="ts">
  import type { UnifiedPlugin } from "@cairn/shared";
  import type { DownloadTask } from "../downloads.js";
  import SplitButton from "./SplitButton.svelte";

  let {
    plugin,
    homes,
    block = false,
    activity = null,
    updateAvailable = false,
    updatesEnabled = false,
    behindHomes = [],
    onUpdate,
    onUpdateHome,
    onInstallAll,
    onRemoveEverywhere,
    onToggleHome,
  }: {
    plugin: UnifiedPlugin;
    homes: { id: string; label: string; icon?: string }[];
    block?: boolean;
    activity?: DownloadTask | null;
    updateAvailable?: boolean;
    // False hides every update affordance: nothing here manages updates, so offering
    // one would promise something no installed plugin can carry out.
    updatesEnabled?: boolean;
    behindHomes?: string[];
    onUpdate?: () => void;
    onUpdateHome?: (homeId: string) => void;
    onInstallAll: () => void;
    onRemoveEverywhere: () => void;
    onToggleHome: (homeId: string, on: boolean) => void;
  } = $props();

  const installedCount = $derived(homes.filter((h) => plugin.homes[h.id]?.installed).length);
  const fullyInstalled = $derived(installedCount === homes.length && homes.length > 0);
  const installableRemainingHomes = $derived(homes.filter((h) => !plugin.homes[h.id]?.installed));
  const showUpdate = $derived(updatesEnabled && updateAvailable);
  // An update is the more useful thing to offer than removal, so it takes the primary
  // slot; removal stays in the menu below, where nothing is lost.
  const isUpdate = $derived(showUpdate && fullyInstalled && !!onUpdate);
  const isRemoveAll = $derived(fullyInstalled && !isUpdate);
  const behindInstalledHomes = $derived(
    showUpdate && onUpdateHome ? homes.filter((h) => plugin.homes[h.id]?.installed && behindHomes.includes(h.id)) : [],
  );
  // A queued or running download for this plugin freezes the button into a
  // progress state so it can't be re-triggered mid-flight.
  const busy = $derived(activity?.status === "pending" || activity?.status === "installing");
  const primaryDisabled = $derived(busy || (!isRemoveAll && !isUpdate && installableRemainingHomes.length === 0));
  const idleLabel = $derived(
    isUpdate
      ? "Update"
      : isRemoveAll
        ? "Remove everywhere"
        : installableRemainingHomes.length === 1
          ? `Install in ${installableRemainingHomes[0].label}`
          : installedCount === 0 && installableRemainingHomes.length === homes.length
            ? "Install everywhere"
            : `Install in ${installableRemainingHomes.length}`,
  );
  const primaryLabel = $derived(
    activity?.status === "pending"
      ? "Pending…"
      : activity?.status === "installing"
        ? (activity.percent >= 0 ? `Installing… ${activity.percent}%` : "Installing…")
        : idleLabel,
  );
</script>

{#snippet menu()}
  <div class="imenu">
    {#each behindInstalledHomes as h (h.id)}
      <button class="mrow" onclick={() => onUpdateHome?.(h.id)}>Update in {h.label}</button>
    {/each}
    {#each homes as h (h.id)}
      {@const on = !!plugin.homes[h.id]?.installed}
      {#if on}
        <button class="mrow danger" onclick={() => onToggleHome(h.id, false)}>Remove from {h.label}</button>
      {:else}
        <button class="mrow" onclick={() => onToggleHome(h.id, true)}>Install in {h.label}</button>
      {/if}
    {/each}
    {#if installedCount > 0 && (!fullyInstalled || isUpdate)}
      <button class="mrow danger" onclick={onRemoveEverywhere}>Remove everywhere</button>
    {/if}
  </div>
{/snippet}

<SplitButton
  label={primaryLabel}
  danger={isRemoveAll && !busy}
  disabled={primaryDisabled}
  progress={busy && activity ? activity.percent : -1}
  {block}
  onPrimary={() => (isUpdate ? onUpdate?.() : isRemoveAll ? onRemoveEverywhere() : onInstallAll())}
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
