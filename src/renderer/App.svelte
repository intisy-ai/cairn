<script lang="ts">
  import { onMount } from "svelte";
  import Titlebar from "./lib/components/Titlebar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Overview from "./lib/routes/Overview.svelte";
  import Providers from "./lib/routes/Providers.svelte";
  import Accounts from "./lib/routes/Accounts.svelte";
  import Routing from "./lib/routes/Routing.svelte";
  import Usage from "./lib/routes/Usage.svelte";
  import LocalApi from "./lib/routes/LocalApi.svelte";
  import Apps from "./lib/routes/Apps.svelte";
  import Plugins from "./lib/routes/Plugins.svelte";
  import Settings from "./lib/routes/Settings.svelte";
  import { router, SCREENS } from "./lib/router.js";
  import { cairn } from "./lib/ipc.js";
  import { fadeMotion } from "./lib/util/motion.js";

  const activeLabel = $derived(SCREENS.find((screen) => screen.id === $router.screen)?.label ?? "");

  let hasRouting = $state(true);

  onMount(async () => {
    const result = await cairn.routingApps();
    hasRouting = result.ok && result.data.length > 0;
  });
</script>

<div class="window">
  <Titlebar title="Cairn" subtitle={activeLabel} />
  <div class="shell">
    <Sidebar {hasRouting} />
    <main class="main">
      {#key $router.screen}
        <div class="screen" in:fadeMotion={{ duration: 120 }}>
          {#if $router.screen === "overview"}
            <Overview />
          {:else if $router.screen === "providers"}
            <Providers />
          {:else if $router.screen === "accounts"}
            <Accounts />
          {:else if $router.screen === "routing"}
            <Routing />
          {:else if $router.screen === "usage"}
            <Usage />
          {:else if $router.screen === "localApi"}
            <LocalApi />
          {:else if $router.screen === "apps"}
            <Apps />
          {:else if $router.screen === "plugins"}
            <Plugins />
          {:else if $router.screen === "settings"}
            <Settings />
          {:else}
            <Overview />
          {/if}
        </div>
      {/key}
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
  @media (max-width: 899px) {
    .shell {
      grid-template-columns: 64px 1fr;
    }
  }
  .main {
    padding: 22px 26px;
    overflow: auto;
  }
  @media (max-width: 640px) {
    .main {
      padding: 18px 16px;
    }
  }
</style>
