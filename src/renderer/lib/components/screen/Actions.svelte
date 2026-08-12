<script lang="ts">
  import type { ScreenNode, ActionSpec } from "@cairn/shared";
  import { cairn } from "../../ipc.js";
  import Button from "../Button.svelte";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import type { ScreenContext } from "./context.js";

  let { node, ctx }: { node: ScreenNode; ctx: ScreenContext } = $props();

  const ids = $derived(Array.isArray(node.ids) ? (node.ids as string[]) : []);

  let declared = $state<ActionSpec[]>([]);

  async function load(homeId: string, plugin: string): Promise<void> {
    const result = await cairn.configSchemas(homeId);
    const full = result.ok ? (result.data.find((s) => s.plugin === plugin) ?? null) : null;
    declared = full?.actions ?? [];
  }

  $effect(() => {
    void load(ctx.homeId, ctx.plugin);
  });

  // An id the plugin never declared (a screen-only action) still has to work, just without
  // the label/confirm/danger metadata that would come from an ActionSpec.
  function resolve(id: string): ActionSpec {
    return declared.find((action) => action.id === id) ?? { id, label: id };
  }

  const actions = $derived(ids.map(resolve));

  let confirming = $state<ActionSpec | null>(null);

  function run(action: ActionSpec): void {
    if (ctx.busy) return;
    if (action.confirm) { confirming = action; return; }
    void ctx.invoke(action.id, {});
  }

  function confirmed(): void {
    const action = confirming;
    confirming = null;
    if (action) void ctx.invoke(action.id, {});
  }
</script>

<div class="actions">
  {#each actions as action (action.id)}
    <Button disabled={ctx.busy} variant={action.danger ? "danger" : "default"} onclick={() => run(action)}>{action.label}</Button>
  {/each}
</div>

{#if confirming}
  <ConfirmDialog
    title={confirming.label}
    message={confirming.confirm ?? ""}
    danger={!!confirming.danger}
    onConfirm={confirmed}
    onCancel={() => (confirming = null)}
  />
{/if}

<style>
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
</style>
