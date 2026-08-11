<script lang="ts">
  import Accounts from "../../lib/routes/Accounts.svelte";
  import Libraries from "../../lib/routes/Libraries.svelte";
  import Activity from "../../lib/routes/Activity.svelte";
  import Apps from "../../lib/routes/Apps.svelte";
  import Plugins from "../../lib/routes/Plugins.svelte";
  import Providers from "../../lib/routes/Providers.svelte";
  import Settings from "../../lib/routes/Settings.svelte";

  let { which }: { which: "plugins" | "apps" | "providers" | "accounts" | "activity" | "libraries" | "settings" } = $props();

  const ROUTES = { plugins: Plugins, apps: Apps, providers: Providers, accounts: Accounts, activity: Activity, libraries: Libraries, settings: Settings };
  const Route = $derived(ROUTES[which]);
</script>

<div class="screen">
  <Route />
</div>

<style>
  .screen {
    padding: var(--space-3xl);
    background: var(--canvas);
    border: var(--hairline) solid var(--border);
    border-radius: var(--radius);
  }
</style>
