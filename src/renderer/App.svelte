<script lang="ts">
  import Titlebar from "./lib/components/Titlebar.svelte";
  import Sidebar from "./lib/components/Sidebar.svelte";
  import type { NavItem } from "./lib/components/Sidebar.svelte";
  import Overview from "./lib/routes/Overview.svelte";

  const navItems: NavItem[] = [
    { label: "Overview", icon: "▤", href: "#", active: true },
    { label: "Providers", icon: "◈", href: "#" },
    { label: "Accounts", icon: "◍", href: "#" },
    { label: "Routing", icon: "⇄", href: "#" },
    { label: "Usage", icon: "◷", href: "#" },
  ];

  const networkItems: NavItem[] = [
    { label: "Local API", icon: "⇢", href: "#" },
    { label: "Share & teams", icon: "◎", href: "#" },
    { label: "Apps & plugins", icon: "⊞", href: "#" },
  ];
</script>

<div class="window">
  <Titlebar title="intisy" subtitle="Overview" />
  <div class="shell">
    <Sidebar {navItems} {networkItems} />
    <main class="main">
      <Overview />
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
