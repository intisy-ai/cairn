<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import Card from "./Card.svelte";
  import VirtualList from "./VirtualList.svelte";

  // Past this many rows the list windows itself: the screens behind it grow without bound.
  const VIRTUALIZE_THRESHOLD = 40;

  let {
    items,
    key,
    view = "list",
    rowHeight = 64,
    testid = "",
    item,
    empty,
  }: {
    items: T[];
    key: (entry: T) => string;
    view?: "list" | "grid";
    rowHeight?: number;
    testid?: string;
    item: Snippet<[T]>;
    empty?: Snippet;
  } = $props();
</script>

{#if view === "grid"}
  <div class="grid" data-testid={testid || undefined}>
    {#each items as entry (key(entry))}
      {@render item(entry)}
    {/each}
  </div>
  {#if items.length === 0 && empty}{@render empty()}{/if}
{:else}
  <Card {testid}>
    {#if items.length > VIRTUALIZE_THRESHOLD}
      <VirtualList {items} {rowHeight}>
        {#snippet row(entry)}
          {@render item(entry)}
        {/snippet}
      </VirtualList>
    {:else}
      {#each items as entry (key(entry))}
        {@render item(entry)}
      {/each}
    {/if}
    {#if items.length === 0 && empty}{@render empty()}{/if}
  </Card>
{/if}

<style>
  /* Cards size to their own content: a stretched row makes every card as tall as the
     wordiest one, which is the dead space that stops a card grid reading as compact. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--track-card), 1fr));
    align-items: start;
    gap: var(--space-md);
  }
</style>
