<script lang="ts">
  import { onMount } from "svelte";
  import type { HomeLibraries, HostApp, UnifiedLibrary } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import { buildUnifiedLibraries, isOrphan } from "../util/unifiedLibraries.js";
  import PageHeader from "../components/PageHeader.svelte";
  import SearchField from "../components/SearchField.svelte";
  import StatCard from "../components/StatCard.svelte";
  import Chip from "../components/Chip.svelte";
  import Button from "../components/Button.svelte";
  import AppPills from "../components/AppPills.svelte";
  import ItemBox from "../components/ItemBox.svelte";
  import ItemList from "../components/ItemList.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";

  const VIRTUALIZE_THRESHOLD = 20;
  const ROW_HEIGHT = 64;
  const COLUMNS = "minmax(180px, 1.6fr) 110px 96px auto";

  let homes = $state<HomeLibraries[]>([]);
  let loadError = $state("");
  let loaded = $state(false);
  let searchRaw = $state("");
  let search = $state("");
  let unusedOnly = $state(false);
  let pendingConfirm = $state<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  const term = $derived(search.trim().toLowerCase());

  // Ecosystem libraries and third-party packages answer different questions ("is my own stack
  // in place" vs "what did this pull in"), so the split stays, as a filter rather than as two
  // lists per home.
  const OWN_SCOPE = "@intisy-ai/";

  const libraries = $derived(buildUnifiedLibraries(homes));
  const homeList = $derived(homes.map((entry) => entry.home));
  // AppPills renders whichever homes it is given, so the library row says where it is
  // installed the same way a plugin row does.
  const pillApps = $derived<HostApp[]>(homeList.map((home) => ({ id: home.id, label: home.label, icon: home.icon })));

  const visible = $derived(
    libraries.filter((library) => {
      if (unusedOnly && !isOrphan(library)) return false;
      if (!term) return true;
      return library.specifier.toLowerCase().includes(term)
        || library.usedBy.some((plugin) => plugin.toLowerCase().includes(term));
    }),
  );

  const totals = $derived({
    all: libraries.length,
    ours: libraries.filter((library) => library.specifier.startsWith(OWN_SCOPE)).length,
    unused: libraries.filter(isOrphan).length,
  });

  function installedIn(library: UnifiedLibrary): Record<string, boolean> {
    return Object.fromEntries(homeList.map((home) => [home.id, !!library.homes[home.id]?.installed]));
  }

  // Versions can differ per home, so the row shows one only when every home agrees; otherwise
  // it says so rather than picking one and implying the others match.
  function versionLabel(library: UnifiedLibrary): string {
    const versions = [...new Set(Object.values(library.homes).map((state) => state.version).filter(Boolean))];
    if (versions.length === 0) return "not built";
    return versions.length === 1 ? versions[0] : "mixed";
  }

  function usedByLabel(library: UnifiedLibrary): string {
    if (library.usedBy.length === 0) return "unused";
    return library.usedBy.join(", ");
  }

  function homesHolding(library: UnifiedLibrary): string[] {
    return homeList.filter((home) => library.homes[home.id]?.installed).map((home) => home.id);
  }

  async function removeEverywhere(library: UnifiedLibrary): Promise<void> {
    const targets = homesHolding(library);
    const failures: string[] = [];
    for (const homeId of targets) {
      const result = await cairn.librariesRemove(homeId, library.specifier);
      if (!result.ok) failures.push(result.error);
    }
    if (failures.length > 0) toast.error(failures[0]);
    else toast.success(`Removed ${library.specifier}`);
    await load();
  }

  async function uninstallUsers(library: UnifiedLibrary): Promise<void> {
    for (const plugin of library.usedBy) {
      const result = await cairn.pluginsRemoveEverywhere(plugin);
      if (!result.ok) {
        toast.error(result.error);
        break;
      }
    }
    await load();
  }

  function confirmRemove(library: UnifiedLibrary): void {
    pendingConfirm = {
      title: "Remove library?",
      message: `Remove ${library.specifier} from ${homesHolding(library).length} home(s). Nothing declares it.`,
      confirmLabel: "Remove",
      run: () => removeEverywhere(library),
    };
  }

  function confirmUninstallUsers(library: UnifiedLibrary): void {
    pendingConfirm = {
      title: "Uninstall the plugins using this?",
      message: `${library.specifier} is used by ${library.usedBy.join(", ")}. Uninstalling them everywhere is what frees it.`,
      confirmLabel: "Uninstall",
      run: () => uninstallUsers(library),
    };
  }

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
  subtitle="Every package installed alongside your plugins, and which of them use it."
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
  <section class="summary">
    <StatCard label="Libraries" value={String(totals.all)} meta={`${totals.ours} from the ecosystem`} />
    <StatCard label="Unused" value={String(totals.unused)} meta="declared by nothing installed" metaColor={totals.unused > 0 ? "var(--warn)" : ""} />
    <StatCard label="Homes" value={String(homeList.length)} meta="each with its own store" />
  </section>

  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search libraries" />
    <Chip label={`Unused ${totals.unused}`} on={unusedOnly} onclick={() => (unusedOnly = !unusedOnly)} />
  </div>

  {#if visible.length === 0}
    <EmptyState message={term || unusedOnly ? "No library matches your filters." : "Nothing installed alongside your plugins yet."} />
  {:else}
    <ItemList items={visible} key={(library) => library.specifier} rowHeight={ROW_HEIGHT} virtualizeAfter={VIRTUALIZE_THRESHOLD}>
      {#snippet item(library)}
        <ItemBox
          columns={COLUMNS}
          testid={"library-" + library.specifier}
          title={library.specifier}
          subtitle={usedByLabel(library)}
        >
          {#snippet actions()}
            <div class="ver" class:missing={versionLabel(library) === "not built"}>{versionLabel(library)}</div>
            <AppPills apps={pillApps} values={installedIn(library)} />
            <div>
              {#if isOrphan(library)}
                <Button onclick={() => confirmRemove(library)}>Remove</Button>
              {:else}
                <Button onclick={() => confirmUninstallUsers(library)}>Uninstall users</Button>
              {/if}
            </div>
          {/snippet}
        </ItemBox>
      {/snippet}
    </ItemList>
  {/if}
{/if}

{#if pendingConfirm}
  <ConfirmDialog
    title={pendingConfirm.title}
    message={pendingConfirm.message}
    confirmLabel={pendingConfirm.confirmLabel}
    danger
    onConfirm={async () => { const p = pendingConfirm; pendingConfirm = null; if (!p) return; await p.run(); }}
    onCancel={() => (pendingConfirm = null)}
  />
{/if}

<style>
  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-2xl);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
    flex-wrap: wrap;
  }
  .ver {
    font-family: var(--mono);
    font-size: var(--fs-xs);
    color: var(--muted);
  }
  .ver.missing {
    color: var(--warn);
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
</style>
