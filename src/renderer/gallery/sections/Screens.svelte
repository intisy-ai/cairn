<script lang="ts">
  import Apps from "../../lib/routes/Apps.svelte";
  import Plugins from "../../lib/routes/Plugins.svelte";
  import Specimen from "../Specimen.svelte";
</script>

<div class="stack">
  <Specimen label="Plugins" wide>
    <Plugins />
  </Specimen>

  <Specimen label="Apps" wide>
    <Apps />
  </Specimen>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
</style>
