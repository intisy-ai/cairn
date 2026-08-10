<script lang="ts">
  import ItemList from "./ItemList.svelte";

  export let count = 3;
  export let view: "list" | "grid" = "list";

  $: items = Array.from({ length: count }, (_, index) => ({ id: `item-${index}` }));
</script>

<ItemList {items} {view} key={(entry) => entry.id} rowHeight={40} testid="items">
  {#snippet item(entry)}
    <div data-testid={entry.id}>{entry.id}</div>
  {/snippet}
  {#snippet empty()}
    <p data-testid="empty">Nothing here.</p>
  {/snippet}
</ItemList>
