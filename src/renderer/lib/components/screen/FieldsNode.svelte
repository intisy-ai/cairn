<script lang="ts">
  import type { ScreenNode, PluginConfigSchema } from "@cairn/shared";
  import { cairn } from "../../ipc.js";
  import PluginControls from "../PluginControls.svelte";
  import Skeleton from "../Skeleton.svelte";
  import type { ScreenContext } from "./context.js";

  let { node, ctx }: { node: ScreenNode; ctx: ScreenContext } = $props();

  const keys = $derived(Array.isArray(node.keys) ? (node.keys as string[]) : []);

  let schema = $state<PluginConfigSchema | null>(null);
  let loaded = $state(false);

  async function load(homeId: string, plugin: string, fieldKeys: string[]): Promise<void> {
    loaded = false;
    const result = await cairn.configSchemas(homeId);
    loaded = true;
    const full = result.ok ? (result.data.find((s) => s.plugin === plugin) ?? null) : null;
    schema = full ? { ...full, fields: (full.fields ?? []).filter((field) => fieldKeys.includes(field.key)) } : null;
  }

  $effect(() => {
    void load(ctx.homeId, ctx.plugin, keys);
  });
</script>

{#if !loaded}
  <Skeleton height="52px" radius="var(--radius-sm)" />
{:else if schema}
  <PluginControls homeId={ctx.homeId} {schema} />
{/if}
