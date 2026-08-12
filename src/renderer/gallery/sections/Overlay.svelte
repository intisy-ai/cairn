<script lang="ts">
  import ActivityDetailDialog from "../../lib/components/ActivityDetailDialog.svelte";
  import MarketplacesDialog from "../../lib/components/MarketplacesDialog.svelte";
  import ConfirmDialog from "../../lib/components/ConfirmDialog.svelte";
  import CustomEndpointsDialog from "../../lib/components/CustomEndpointsDialog.svelte";
  import PluginDetail from "../../lib/components/PluginDetail.svelte";
  import { ACTIVITY, PLUGIN_DETAIL, PLUGIN_DETAIL_HOMES } from "../fixtures.js";

  let { which }: { which: "activity-detail" | "marketplaces" | "confirm" | "confirm-optin" | "custom-endpoints" | "plugin-detail" } = $props();

  const noop = (): void => {};
</script>

{#if which === "activity-detail"}
  <ActivityDetailDialog record={ACTIVITY[1]} onClose={noop} />
{:else if which === "marketplaces"}
  <MarketplacesDialog onClose={noop} />
{:else if which === "custom-endpoints"}
  <CustomEndpointsDialog onClose={noop} />
{:else if which === "plugin-detail"}
  <PluginDetail
    plugin={PLUGIN_DETAIL}
    homes={PLUGIN_DETAIL_HOMES}
    onClose={noop}
    onInstallAll={noop}
    onRemoveEverywhere={noop}
    onUpdate={noop}
    onUpdateHome={async () => {}}
    onToggleHome={noop}
  />
{:else if which === "confirm-optin"}
  <ConfirmDialog
    title="Remove everywhere?"
    message="Remove wakatime-sync from every app it's installed in? This can't be undone."
    confirmLabel="Remove everywhere"
    danger
    optIn="Also delete its settings and logs"
    optInNote="3 files (1.2 KB) in Claude Code, OpenCode"
    onConfirm={noop}
    onCancel={noop}
  />
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
