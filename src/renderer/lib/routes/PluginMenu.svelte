<script lang="ts">
  import { onMount } from "svelte";
  import type { PluginConfigSchema, PluginMenu } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import Card from "../components/Card.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import PluginControls from "../components/PluginControls.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import Skeleton from "../components/Skeleton.svelte";

  // The screen a plugin asked for. Everything on it is the plugin's own declared data:
  // its label, the homes it is installed in, and the settings and actions it exposes.
  let { plugin }: { plugin: string } = $props();

  let menu = $state<PluginMenu | null>(null);
  let homeIds = $state<string[]>([]);
  let homeLabels = $state<Record<string, string>>({});
  let selectedHome = $state("");
  let schema = $state<PluginConfigSchema | null>(null);
  let loadError = $state("");
  let loaded = $state(false);

  async function load(): Promise<void> {
    const [menus, sections] = await Promise.all([cairn.menusList(), cairn.pluginsList()]);
    if (!menus.ok) {
      loadError = menus.error;
      loaded = true;
      return;
    }
    menu = menus.data.find((m) => m.plugin === plugin) ?? null;
    homeIds = menu?.homes ?? [];
    if (sections.ok) homeLabels = Object.fromEntries(sections.data.map((s) => [s.home.id, s.home.label]));
    selectedHome = homeIds[0] ?? "";
    loaded = true;
  }

  async function loadSchema(homeId: string): Promise<void> {
    const result = await cairn.configSchemas(homeId);
    if (selectedHome !== homeId) return;
    if (!result.ok) {
      loadError = result.error;
      schema = null;
      return;
    }
    loadError = "";
    schema = result.data.find((s) => s.plugin === plugin) ?? null;
  }

  $effect(() => {
    if (selectedHome) void loadSchema(selectedHome);
  });

  function labelFor(homeId: string): string {
    return homeLabels[homeId] ?? homeId;
  }

  onMount(() => { void load(); });
</script>

<PageHeader title={menu?.label ?? plugin} subtitle={`Settings and actions ${plugin} contributes.`} />

{#if !loaded}
  <Skeleton height="80px" radius="12px" />
{:else if loadError}
  <ErrorState message={`Could not load this plugin's menu: ${loadError}`} onRetry={load} />
{:else if homeIds.length === 0}
  <Card><p class="empty">{plugin} is not installed in any app.</p></Card>
{:else}
  {#if homeIds.length > 1}
    <div class="homes">
      {#each homeIds as homeId (homeId)}
        <button class="hchip" class:on={selectedHome === homeId} onclick={() => (selectedHome = homeId)}>{labelFor(homeId)}</button>
      {/each}
    </div>
  {/if}
  <Card>
    <div class="controls">
      {#if schema}
        <PluginControls homeId={selectedHome} {schema} />
      {:else}
        <p class="empty">No settings to show for {labelFor(selectedHome)}.</p>
      {/if}
    </div>
  </Card>
{/if}

<style>
  .homes {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin: 0 2px 12px;
  }
  .hchip {
    font-size: 11.5px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--muted);
    border-radius: 20px;
    padding: 3px 11px;
    cursor: pointer;
  }
  .hchip.on {
    background: var(--accent-weak);
    color: var(--accent);
    border-color: var(--accent-border);
  }
  .controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 18px;
  }
  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
</style>
