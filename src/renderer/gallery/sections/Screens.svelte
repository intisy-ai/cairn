<script lang="ts">
  import Accounts from "../../lib/routes/Accounts.svelte";
  import Apps from "../../lib/routes/Apps.svelte";
  import Plugins from "../../lib/routes/Plugins.svelte";
  import Providers from "../../lib/routes/Providers.svelte";
  import Specimen from "../Specimen.svelte";
</script>

<div class="stack">
  <Specimen label="Plugins" wide>
    <Plugins />
  </Specimen>

  <Specimen label="Apps" wide>
    <Apps />
  </Specimen>

  <Specimen label="Providers" wide>
    <Providers />
  </Specimen>

  <Specimen label="Accounts" wide>
    <Accounts />
  </Specimen>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
</style>
