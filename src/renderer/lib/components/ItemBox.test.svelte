<script lang="ts">
  import ItemBox from "./ItemBox.svelte";

  export let view: "list" | "grid" = "list";
  export let onOpen: (() => void) | undefined = undefined;
  export let columns = "";
</script>

<ItemBox
  {view}
  {columns}
  {onOpen}
  testid="box"
  title="Antigravity"
  subtitle="3 accounts"
  openLabel="View Antigravity"
>
  {#snippet icon()}<span data-testid="icon">A</span>{/snippet}
  {#snippet badges()}<span data-testid="badge">v1.0</span>{/snippet}
  {#snippet actions()}<span data-testid="action">act</span>{/snippet}
  {#snippet corner()}<span data-testid="corner">star</span>{/snippet}
</ItemBox>
