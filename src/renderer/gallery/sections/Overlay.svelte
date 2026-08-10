<script lang="ts">
  import ActivityDetailDialog from "../../lib/components/ActivityDetailDialog.svelte";
  import MarketplacesDialog from "../../lib/components/MarketplacesDialog.svelte";
  import ConfirmDialog from "../../lib/components/ConfirmDialog.svelte";
  import CustomEndpointsDialog from "../../lib/components/CustomEndpointsDialog.svelte";
  import { ACTIVITY } from "../fixtures.js";

  let { which }: { which: "activity-detail" | "marketplaces" | "confirm" | "custom-endpoints" } = $props();

  const noop = (): void => {};
</script>

{#if which === "activity-detail"}
  <ActivityDetailDialog record={ACTIVITY[1]} onClose={noop} />
{:else if which === "marketplaces"}
  <MarketplacesDialog onClose={noop} />
{:else if which === "custom-endpoints"}
  <CustomEndpointsDialog onClose={noop} />
{:else}
  <ConfirmDialog
    title="Remove account?"
    message="Remove ben@birich.de? You'll need to sign in again to use it."
    confirmLabel="Remove"
    danger
    onConfirm={noop}
    onCancel={noop}
  />
{/if}
