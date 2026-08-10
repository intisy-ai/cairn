<script lang="ts">
  import Button from "../../lib/components/Button.svelte";
  import ItemBox from "../../lib/components/ItemBox.svelte";
  import ItemList from "../../lib/components/ItemList.svelte";
  import PluginIcon, { LOGO_SIZE } from "../../lib/components/PluginIcon.svelte";
  import StatusPill from "../../lib/components/StatusPill.svelte";
  import ToggleSwitch from "../../lib/components/ToggleSwitch.svelte";
  import Specimen from "../Specimen.svelte";
  import { LONG_NAME, LOREM } from "../fixtures.js";

  type Item = { name: string; sub: string; description: string; version: string; connected: boolean };

  const ITEMS: Item[] = [
    { name: "Antigravity", sub: "provider", description: LOREM, version: "2.1.0", connected: true },
    { name: "Wakatime sync", sub: "plugin", description: "Reports coding activity to WakaTime.", version: "1.4.0", connected: false },
    { name: LONG_NAME, sub: "plugin", description: LOREM, version: "0.1.0", connected: false },
    { name: "Config ledger", sub: "plugin", description: "Keeps every home's config in one git repo.", version: "3.0.2", connected: true },
  ];

  const noop = (): void => {};
</script>

{#snippet box(entry: Item, view: "list" | "grid")}
  <ItemBox
    {view}
    title={entry.name}
    subtitle={entry.description}
    selected={entry.connected}
    openLabel={`View ${entry.name}`}
    onOpen={noop}
  >
    {#snippet icon()}
      <PluginIcon name={entry.name} kind="plugin" size={LOGO_SIZE.list} />
    {/snippet}
    {#snippet badges()}
      <span class="ver">v{entry.version}</span>
    {/snippet}
    {#snippet actions()}
      <StatusPill variant={entry.connected ? "good" : "off"} label={entry.connected ? "Installed" : "Not installed"} />
      <Button variant={entry.connected ? "default" : "primary"}>{entry.connected ? "Remove" : "Install"}</Button>
    {/snippet}
  </ItemBox>
{/snippet}

<div class="stack">
  <Specimen label="ItemList, list view" wide>
    <ItemList items={ITEMS} key={(entry) => entry.name}>
      {#snippet item(entry)}{@render box(entry, "list")}{/snippet}
    </ItemList>
  </Specimen>

  <Specimen label="ItemList, grid view" wide>
    <ItemList items={ITEMS} key={(entry) => entry.name} view="grid">
      {#snippet item(entry)}{@render box(entry, "grid")}{/snippet}
    </ItemList>
  </Specimen>

  <Specimen label="ItemBox with aligned columns" wide>
    <ItemList items={ITEMS} key={(entry) => entry.name}>
      {#snippet item(entry)}
        <ItemBox title={entry.name} subtitle={entry.sub} monoSubtitle columns="minmax(0, 1fr) 118px 46px">
          {#snippet icon()}
            <PluginIcon name={entry.name} kind="provider" size={LOGO_SIZE.compact} />
          {/snippet}
          {#snippet actions()}
            <StatusPill variant={entry.connected ? "good" : "off"} label={entry.connected ? "Enabled" : "Off"} />
            <ToggleSwitch checked={entry.connected} label={entry.name} />
          {/snippet}
        </ItemBox>
      {/snippet}
    </ItemList>
  </Specimen>
</div>

<style>
  .stack {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .ver {
    font-family: var(--mono);
    font-size: var(--fs-micro);
    color: var(--accent);
    background: var(--accent-weak);
    border-radius: var(--radius-xs);
    padding: 1px 6px;
    flex: none;
  }
</style>
