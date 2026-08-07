<script lang="ts">
  import { onMount } from "svelte";
  import type { HomeLibraries, InstalledLibrary } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { debounce } from "../util/debounce.js";
  import PageHeader from "../components/PageHeader.svelte";
  import SearchField from "../components/SearchField.svelte";
  import Card from "../components/Card.svelte";
  import Chip from "../components/Chip.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import CollapsibleGroup from "../components/CollapsibleGroup.svelte";

  let homes = $state<HomeLibraries[]>([]);
  let loadError = $state("");
  let loaded = $state(false);
  let searchRaw = $state("");
  let search = $state("");
  let sharedOnly = $state(false);

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  const term = $derived(search.trim().toLowerCase());

  function matches(library: InstalledLibrary): boolean {
    return !term || library.specifier.toLowerCase().includes(term);
  }

  // A home with nothing left after filtering is dropped rather than shown empty, so what
  // remains is only where the thing being looked for actually is.
  const visibleHomes = $derived.by(() =>
    homes
      .map((entry) => ({
        home: entry.home,
        shared: entry.shared.filter(matches),
        plugins: sharedOnly
          ? []
          : entry.plugins
              .map((p) => ({ plugin: p.plugin, dependencies: p.dependencies.filter(matches) }))
              .filter((p) => p.dependencies.length > 0),
      }))
      .filter((entry) => entry.shared.length > 0 || entry.plugins.length > 0));

  const totals = $derived({
    shared: homes.reduce((sum, entry) => sum + entry.shared.length, 0),
    plugins: homes.reduce((sum, entry) => sum + entry.plugins.length, 0),
  });

  async function load(): Promise<void> {
    const result = await cairn.librariesList();
    if (result.ok) {
      homes = result.data;
      loadError = "";
    } else {
      loadError = result.error;
    }
  }

  onMount(() => {
    load().finally(() => (loaded = true));
  });
</script>

<PageHeader
  title="Libraries"
  subtitle={loaded && !loadError
    ? `${totals.shared} shared ${totals.shared === 1 ? "library" : "libraries"}, and the dependencies of ${totals.plugins} ${totals.plugins === 1 ? "plugin" : "plugins"}.`
    : "Every package installed alongside your plugins, per home."}
/>

{#if loadError}
  <ErrorState message={"Could not load libraries: " + loadError} onRetry={load} />
{:else if !loaded}
  <div class="skeletons">
    {#each Array(4) as _}
      <Skeleton height="52px" radius="10px" />
    {/each}
  </div>
{:else}
  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search libraries" />
    <Chip label="Shared only" on={sharedOnly} onclick={() => (sharedOnly = !sharedOnly)} />
  </div>

  {#each visibleHomes as entry (entry.home.id)}
    <CollapsibleGroup label={entry.home.label} count={entry.shared.length + entry.plugins.length}>
      {#snippet body()}
        {#if entry.shared.length > 0}
          <p class="sectionlabel">Shared</p>
          <Card>
            {#each entry.shared as library (library.specifier)}
              <div class="lib">
                <span class="spec">{library.specifier}</span>
                <span class="ver">{library.version || "not built"}</span>
                <span class="users">{library.usedBy.length > 0 ? library.usedBy.join(", ") : "unused"}</span>
              </div>
            {/each}
          </Card>
        {/if}
        {#each entry.plugins as group (group.plugin)}
          <p class="sectionlabel">{group.plugin}</p>
          <Card>
            {#each group.dependencies as library (library.specifier)}
              <div class="lib">
                <span class="spec">{library.specifier}</span>
                <span class="ver" class:missing={!library.version}>{library.version || "not installed"}</span>
                <span class="users"></span>
              </div>
            {/each}
          </Card>
        {/each}
      {/snippet}
    </CollapsibleGroup>
  {:else}
    <EmptyState
      message={term || sharedOnly ? "No library matches your filters." : "No libraries installed yet."}
      actionLabel={term || sharedOnly ? "Clear filters" : undefined}
      onAction={term || sharedOnly ? () => { searchRaw = ""; search = ""; sharedOnly = false; } : undefined}
    />
  {/each}
{/if}

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 18px;
    flex-wrap: wrap;
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sectionlabel {
    margin: 14px 2px 7px;
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .sectionlabel:first-child {
    margin-top: 0;
  }
  .lib {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 2fr);
    align-items: center;
    gap: 12px;
    padding: 9px 16px;
    border-top: 1px solid var(--border);
  }
  .lib:first-child {
    border-top: 0;
  }
  .spec {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ver {
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--muted);
  }
  .ver.missing {
    color: var(--crit);
  }
  .users {
    font-size: 11.5px;
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
