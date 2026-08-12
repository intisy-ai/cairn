<script lang="ts">
  import type { ScreenNode } from "@cairn/shared";
  import Button from "../Button.svelte";
  import ConfirmDialog from "../ConfirmDialog.svelte";
  import type { ScreenContext } from "./context.js";

  interface ActionEntry { id: string; label?: string; confirm?: string; danger?: boolean }

  let { node, ctx }: { node: ScreenNode; ctx: ScreenContext } = $props();

  function toEntry(raw: unknown): ActionEntry | null {
    if (typeof raw === "string") return { id: raw };
    if (raw && typeof raw === "object" && typeof (raw as ActionEntry).id === "string") return raw as ActionEntry;
    return null;
  }

  const actions = $derived(
    (Array.isArray(node.ids) ? (node.ids as unknown[]) : []).map(toEntry).filter((entry): entry is ActionEntry => entry !== null),
  );

  let confirming = $state<ActionEntry | null>(null);

  function run(action: ActionEntry): void {
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
    <Button disabled={ctx.busy} variant={action.danger ? "danger" : "default"} onclick={() => run(action)}>{action.label ?? action.id}</Button>
  {/each}
</div>

{#if confirming}
  <ConfirmDialog
    title={confirming.label ?? confirming.id}
    message={confirming.confirm ?? ""}
    danger={!!confirming.danger}
    onConfirm={confirmed}
    onCancel={() => (confirming = null)}
  />
{/if}

<style>
  .actions { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
</style>
