<script lang="ts">
  import Button from "../../lib/components/Button.svelte";
  import Chip from "../../lib/components/Chip.svelte";
  import IconButton from "../../lib/components/IconButton.svelte";
  import PluginIcon, { LOGO_SIZE } from "../../lib/components/PluginIcon.svelte";
  import QuotaBar from "../../lib/components/QuotaBar.svelte";
  import SearchField from "../../lib/components/SearchField.svelte";
  import Skeleton from "../../lib/components/Skeleton.svelte";
  import Spinner from "../../lib/components/Spinner.svelte";
  import StatusPill from "../../lib/components/StatusPill.svelte";
  import ToggleSwitch from "../../lib/components/ToggleSwitch.svelte";
  import ViewToggle from "../../lib/components/ViewToggle.svelte";
  import Specimen from "../Specimen.svelte";

  const noop = (): void => {};
</script>

<div class="grid">
  <Specimen label="Button">
    <Button>Default</Button>
    <Button variant="primary">Primary</Button>
    <Button variant="danger">Danger</Button>
    <Button variant="ghost">Ghost</Button>
    <Button disabled>Disabled</Button>
    <Button variant="primary"><Spinner />Working</Button>
  </Specimen>

  <Specimen label="StatusPill">
    <StatusPill variant="good" label="Up to date" />
    <StatusPill variant="warn" label="Update available" />
    <StatusPill variant="off" label="Not connected" />
  </Specimen>

  <Specimen label="Chip">
    <Chip label="All" on />
    <Chip label="Providers" />
    <Chip label="Installed" />
  </Specimen>

  <Specimen label="ToggleSwitch">
    <ToggleSwitch checked label="On" />
    <ToggleSwitch label="Off" />
    <ToggleSwitch checked disabled label="Disabled" />
  </Specimen>

  <Specimen label="IconButton / ViewToggle">
    <IconButton name="refresh" title="Refresh" onclick={noop} />
    <IconButton name="trash" title="Remove" danger onclick={noop} />
    <IconButton name="refresh" title="Busy" disabled onclick={noop} />
    <ViewToggle value="list" onChange={noop} />
    <ViewToggle value="grid" onChange={noop} />
  </Specimen>

  <Specimen label="SearchField">
    <SearchField value="" placeholder="Search plugins" />
    <SearchField value="antigravity" placeholder="Search plugins" />
  </Specimen>

  <Specimen label="PluginIcon">
    <PluginIcon name="Antigravity" kind="provider" size={LOGO_SIZE.detail} />
    <PluginIcon name="Antigravity" kind="provider" size={LOGO_SIZE.list} />
    <PluginIcon name="Antigravity" kind="provider" size={LOGO_SIZE.compact} />
    <PluginIcon name="Local proxy" kind="proxy" size={LOGO_SIZE.list} />
    <PluginIcon name="Wakatime sync" kind="plugin" size={LOGO_SIZE.list} />
  </Specimen>

  <Specimen label="QuotaBar" wide>
    <QuotaBar label="fast" remainingFraction={0.72} />
    <QuotaBar label="deep" remainingFraction={0.08} />
  </Specimen>

  <Specimen label="Skeleton" wide>
    <Skeleton height="60px" radius="12px" />
    <Skeleton lines={3} />
  </Specimen>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }
</style>
