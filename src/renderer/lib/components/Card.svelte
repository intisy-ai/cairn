<script lang="ts">
  import type { Snippet } from "svelte";

  let { testid = "", children }: { testid?: string; children?: Snippet } = $props();
</script>

<div class="card" data-testid={testid || undefined}>
  {#if children}{@render children()}{/if}
</div>

<style>
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
</style>
