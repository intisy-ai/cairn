<script lang="ts">
  import Titlebar from "./lib/components/Titlebar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Overview from "./lib/routes/Overview.svelte";
  import RoutePlaceholder from "./lib/routes/RoutePlaceholder.svelte";
  import { router, SCREENS } from "./lib/router.js";

  const activeLabel = $derived(SCREENS.find((screen) => screen.id === $router.screen)?.label ?? "");
</script>

<div class="window">
  <Titlebar title="intisy" subtitle={activeLabel} />
  <div class="shell">
    <Sidebar />
    <main class="main">
      {#if $router.screen === "overview"}
        <Overview />
      {:else}
        <RoutePlaceholder label={activeLabel} />
      {/if}
    </main>
  </div>
</div>

<style>
  .window {
    width: 100%;
    height: 100%;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .shell {
    display: grid;
    grid-template-columns: 224px 1fr;
    flex: 1;
    min-height: 0;
  }
  .main {
    padding: 22px 26px;
    overflow: auto;
  }
</style>
