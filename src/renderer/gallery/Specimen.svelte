<script lang="ts">
  import type { Snippet } from "svelte";

  let { label, wide = false, children }: { label: string; wide?: boolean; children: Snippet } = $props();
</script>

<div class="specimen" class:wide>
  <p class="label">{label}</p>
  <div class="stage">{@render children()}</div>
</div>

<style>
  .specimen {
    min-width: 0;
  }
  .specimen.wide {
    grid-column: 1 / -1;
  }
  .stage {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-md);
    margin-top: var(--space-xs);
    padding: var(--space-lg);
    background: var(--canvas);
    border: var(--hairline) solid var(--border);
    border-radius: var(--radius);
  }
  .specimen.wide .stage {
    display: flex;
    flex-direction: column;
    align-items: stretch;
  }
</style>
