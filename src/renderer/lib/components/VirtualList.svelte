<script lang="ts" generics="T">
  let {
    items,
    rowHeight,
    overscan = 6,
    viewportHeight = 420,
    row,
    empty,
  }: {
    items: T[];
    rowHeight: number;
    overscan?: number;
    viewportHeight?: number;
    row: import("svelte").Snippet<[T, number]>;
    empty?: import("svelte").Snippet;
  } = $props();

  let scrollTop = $state(0);

  const start = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const visibleCount = $derived(Math.ceil(viewportHeight / rowHeight) + overscan * 2);
  const end = $derived(Math.min(items.length, start + visibleCount));
  const windowed = $derived(items.slice(start, end));

  function onScroll(event: Event): void {
    scrollTop = (event.currentTarget as HTMLElement).scrollTop;
  }
</script>

{#if items.length === 0 && empty}
  {@render empty()}
{:else}
  <div class="vp" style="height:{viewportHeight}px" onscroll={onScroll}>
    <div class="spacer" style="height:{items.length * rowHeight}px">
      {#each windowed as item, i (start + i)}
        <div class="vrow" style="top:{(start + i) * rowHeight}px;height:{rowHeight}px">
          {@render row(item, start + i)}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .vp { overflow-y: auto; overflow-x: hidden; position: relative; }
  .spacer { position: relative; width: 100%; }
  .vrow { position: absolute; left: 0; right: 0; }
</style>
