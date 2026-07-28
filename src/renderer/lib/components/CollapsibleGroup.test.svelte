<script lang="ts">
  import CollapsibleGroup from "./CollapsibleGroup.svelte";

  export let open = true;
</script>

<CollapsibleGroup label="Connected" count={3} bind:open>
  {#snippet body()}
    Test body content
  {/snippet}
</CollapsibleGroup>
