<script lang="ts">
  import type { Snippet } from "svelte";
  let { title, subtitle, actions }: { title: string; subtitle?: string; actions?: Snippet } = $props();
</script>

<div class="page-header">
  <div class="ph-text">
    <h1>{title}</h1>
    {#if subtitle}<p>{subtitle}</p>{/if}
  </div>
  {#if actions}<div class="ph-actions">{@render actions()}</div>{/if}
</div>

<style>
  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2xl);
    margin-bottom: var(--space-3xl);
  }
  .ph-text h1 {
    margin: 0;
    font-size: var(--fs-xl);
    letter-spacing: -.02em;
    font-weight: 650;
  }
  .ph-text p {
    margin: var(--space-3xs) 0 0;
    color: var(--muted);
    font-size: var(--fs-sm);
  }
  .ph-actions {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-shrink: 0;
  }
</style>
