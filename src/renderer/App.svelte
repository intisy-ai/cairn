<script lang="ts">
  import { onMount } from "svelte";
  import Titlebar from "./lib/components/Titlebar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import Skeleton from "./lib/components/Skeleton.svelte";
  import { router, SCREENS } from "./lib/router.js";
  import type { ScreenId } from "./lib/router.js";

  // Routes load on first visit (code-split) instead of all up front.
  const ROUTES: Record<string, () => Promise<{ default: unknown }>> = {
    overview: () => import("./lib/routes/Overview.svelte"),
    providers: () => import("./lib/routes/Providers.svelte"),
    accounts: () => import("./lib/routes/Accounts.svelte"),
    routing: () => import("./lib/routes/Routing.svelte"),
    usage: () => import("./lib/routes/Usage.svelte"),
    localApi: () => import("./lib/routes/LocalApi.svelte"),
    apps: () => import("./lib/routes/Apps.svelte"),
    plugins: () => import("./lib/routes/Plugins.svelte"),
    settings: () => import("./lib/routes/Settings.svelte"),
  };

  function loadRoute(screen: ScreenId): Promise<{ default: unknown }> {
    return (ROUTES[screen] ?? ROUTES.overview)();
  }
  import { cairn } from "./lib/ipc.js";
  import { fadeMotion } from "./lib/util/motion.js";

  const activeLabel = $derived(SCREENS.find((screen) => screen.id === $router.screen)?.label ?? "");

  // Depend only on the screen value, never the whole router store: a route that
  // mutates params in onMount (Plugins clears its deep-link param) must not make
  // this re-import and remount the route in a loop.
  const screen = $derived($router.screen);
  const routeModule = $derived(loadRoute(screen));

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
      {#key screen}
        <div class="screen" in:fadeMotion={{ duration: 120 }}>
          {#await routeModule}
            <div class="route-loading"><Skeleton height="80px" radius="12px" /></div>
          {:then module}
            {@const Route = module.default as typeof Skeleton}
            <Route />
          {:catch}
            <p class="route-error">Could not load this screen.</p>
          {/await}
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
  .route-loading {
    padding: 8px 0;
  }
  .route-error {
    color: var(--crit);
    font-size: 13px;
  }
  @media (max-width: 640px) {
    .main {
      padding: 18px 16px;
    }
  }
</style>
