<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, AccountView } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import { accountLabel, accountStatusInfo } from "../util/accountStatus.js";
  import AccountRow from "../components/AccountRow.svelte";
  import Button from "../components/Button.svelte";
  import SearchField from "../components/SearchField.svelte";
  import CollapsibleGroup from "../components/CollapsibleGroup.svelte";
  import ItemList from "../components/ItemList.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import AddAccountDialog from "../components/AddAccountDialog.svelte";

  const VIRTUALIZE_THRESHOLD = 20;
  const ACCOUNT_ROW_HEIGHT = 64;
  const SECTION_HEADER_HEIGHT = 46;

  // Several providers can read and write one account store (antigravity and gemini-cli
  // share a pool), so the pool, not the provider, is what has accounts. Keying sections by
  // provider showed the same account once per lane and offered to add it twice.
  type AccountPool = {
    id: string;
    label: string;
    providers: ProviderRowData[];
    // The lane whose bundle loaded, since every account call goes through a provider's
    // controller and a broken sibling would fail calls the pool can otherwise serve.
    controllerId: string;
    accountCount: number;
    error: string;
  };

  let providers = $state<ProviderRowData[]>([]);
  let providersError = $state("");
  let loaded = $state(false);
  let accountsByPool = $state<Record<string, AccountView[]>>({});
  let accountErrors = $state<Record<string, string>>({});
  let loadingAccounts = $state<Record<string, boolean>>({});
  let openSections = $state<Record<string, boolean>>({});
  let searchRaw = $state("");
  let search = $state("");
  let pendingConfirm = $state<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  let addFor = $state<{ id: string; label: string } | null>(null);
  let pickerOpen = $state(false);
  let pickerFilter = $state("");
  let pickerEl = $state<HTMLDivElement | undefined>(undefined);

  const requested = new Set<string>();

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  const term = $derived(search.trim().toLowerCase());
  const searching = $derived(term.length > 0);

  function toPool(lanes: ProviderRowData[]): AccountPool {
    const usable = lanes.find((lane) => !lane.defsError) ?? lanes[0];
    return {
      id: lanes[0].accountPool,
      label: lanes.map((lane) => lane.label).join(", "),
      providers: lanes,
      controllerId: usable.id,
      accountCount: Math.max(...lanes.map((lane) => lane.accountCount)),
      error: usable.defsError ?? "",
    };
  }

  const pools = $derived.by(() => {
    const lanesByPool = new Map<string, ProviderRowData[]>();
    for (const provider of providers) {
      const lanes = lanesByPool.get(provider.accountPool) ?? [];
      lanes.push(provider);
      lanesByPool.set(provider.accountPool, lanes);
    }
    return [...lanesByPool.values()].map(toPool);
  });

  const connected = $derived(pools.filter((pool) => pool.accountCount > 0));

  // Every pool gets a section, signed into or not. What keeps that affordable is that a
  // section is closed until asked for: the count on the header is the one already on the
  // provider rows, and no pool's accounts are listed until its section opens.
  const visiblePools = $derived.by(() => {
    if (!term) return pools;
    return pools.filter((pool) =>
      pool.label.toLowerCase().includes(term)
      || (accountsByPool[pool.id] ?? []).some((account) => accountLabel(account).toLowerCase().includes(term)));
  });

  const anySectionOpen = $derived(Object.values(openSections).some(Boolean));

  // A search that matched inside a section is useless with the section shut, so searching
  // opens what it matched until the search is cleared.
  function isOpen(poolId: string): boolean {
    return openSections[poolId] ?? searching;
  }

  function setOpen(pool: AccountPool, open: boolean): void {
    openSections[pool.id] = open;
    if (open) ensureAccounts(pool);
  }

  const totalAccounts = $derived(pools.reduce((sum, pool) => sum + pool.accountCount, 0));

  const pickerPools = $derived.by(() => {
    const filter = pickerFilter.trim().toLowerCase();
    return filter ? pools.filter((pool) => pool.label.toLowerCase().includes(filter)) : pools;
  });

  // Matching a pool by name means every one of its accounts matched too, otherwise
  // searching for a provider would show its section with nothing in it.
  function accountsFor(pool: AccountPool): AccountView[] {
    const accounts = accountsByPool[pool.id] ?? [];
    if (!term || pool.label.toLowerCase().includes(term)) return accounts;
    return accounts.filter((account) => accountLabel(account).toLowerCase().includes(term));
  }

  async function loadAccounts(pool: AccountPool): Promise<void> {
    loadingAccounts[pool.id] = true;
    const result = await cairn.accountsList(pool.controllerId);
    loadingAccounts[pool.id] = false;
    if (!result.ok) {
      accountErrors[pool.id] = result.error;
      return;
    }
    accountsByPool[pool.id] = result.data;
    accountErrors[pool.id] = "";
    // Keeps the count that decides whether this pool has a section at all in step with what
    // was just listed, so removing the last account retires the section without a second
    // round trip for every other pool. Every lane carries the pool's count, so every lane
    // is corrected.
    for (const lane of providers) {
      if (lane.accountPool === pool.id) lane.accountCount = result.data.length;
    }
  }

  function ensureAccounts(pool: AccountPool): void {
    if (requested.has(pool.id)) return;
    requested.add(pool.id);
    void loadAccounts(pool);
  }

  // Searching has to look inside accounts nobody has opened yet, so a search (and only a
  // search) is what makes the screen read them all.
  $effect(() => {
    if (!term) return;
    for (const pool of pools) ensureAccounts(pool);
  });

  async function load(): Promise<void> {
    const result = await cairn.providersList();
    if (!result.ok) {
      providersError = result.error;
      providers = [];
      return;
    }
    providersError = "";
    providers = result.data;
  }

  async function handleToggle(pool: AccountPool, id: string, on: boolean): Promise<void> {
    const result = await cairn.accountsEnable(pool.controllerId, id, on);
    if (!result.ok) toast.error(result.error);
    await loadAccounts(pool);
  }

  async function handleRemove(pool: AccountPool, id: string): Promise<void> {
    const result = await cairn.accountsRemove(pool.controllerId, id);
    if (result.ok) {
      toast.success("Account removed");
    } else {
      toast.error(result.error);
    }
    await loadAccounts(pool);
  }

  function confirmRemove(pool: AccountPool, account: AccountView): void {
    pendingConfirm = {
      title: "Remove account?",
      message: `Remove ${accountLabel(account)}? You'll need to sign in again to use it.`,
      confirmLabel: "Remove",
      run: () => handleRemove(pool, account.id),
    };
  }

  function openPicker(): void {
    pickerFilter = "";
    pickerOpen = !pickerOpen;
  }

  function pickPool(pool: AccountPool): void {
    pickerOpen = false;
    addFor = { id: pool.controllerId, label: pool.label };
  }

  function closePickerOnOutsideClick(event: MouseEvent): void {
    if (!pickerOpen) return;
    if (pickerEl && event.target instanceof Node && pickerEl.contains(event.target)) return;
    pickerOpen = false;
  }

  onMount(() => {
    load().finally(() => (loaded = true));
  });
</script>

<svelte:window onclick={closePickerOnOutsideClick} />

<div class="head">
  <div>
    <h1>Accounts</h1>
    {#if loaded && !providersError && providers.length > 0}
      <p>
        {totalAccounts} {totalAccounts === 1 ? "account" : "accounts"}
        across {connected.length} of {pools.length} {pools.length === 1 ? "provider" : "providers"}.
      </p>
    {:else}
      <p>Signed-in accounts across every provider, with quota and status at a glance.</p>
    {/if}
  </div>
  {#if loaded && !providersError && providers.length > 0}
    <div class="picker" bind:this={pickerEl}>
      <Button variant="primary" onclick={openPicker}>Add account</Button>
      {#if pickerOpen}
        <div class="menu" role="menu">
          <input
            class="filter"
            aria-label="Filter providers"
            placeholder="Filter providers"
            bind:value={pickerFilter}
          />
          <div class="menuscroll">
            {#each pickerPools as pool (pool.id)}
              <button role="menuitem" onclick={() => pickPool(pool)}>
                <span class="mlabel">{pool.label}</span>
                {#if pool.accountCount > 0}<span class="mcount">{pool.accountCount}</span>{/if}
              </button>
            {:else}
              <p class="mempty">No provider matches.</p>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

{#if providersError}
  <ErrorState message={"Could not load providers: " + providersError} onRetry={load} />
{:else if !loaded}
  <div class="skeletons">
    {#each Array(5) as _}
      <Skeleton height="52px" radius="10px" />
    {/each}
  </div>
{:else}
  <div class="toolbar">
    <SearchField bind:value={searchRaw} placeholder="Search accounts" />
  </div>

  {#if visiblePools.length === 0}
    <p class="empty">
      {searching
        ? "No account or provider matches your search."
        : "No providers installed yet. Install one from Plugins to sign in."}
    </p>
  {:else if visiblePools.length > VIRTUALIZE_THRESHOLD && !anySectionOpen}
    <!-- Closed sections are uniform headers, so the long list windows; opening one makes the
         heights uneven and narrows the list to what you are looking at anyway. -->
    <VirtualList items={visiblePools} rowHeight={SECTION_HEADER_HEIGHT}>
      {#snippet row(pool)}
        {@render poolSection(pool)}
      {/snippet}
    </VirtualList>
  {:else}
    {#each visiblePools as pool (pool.id)}
      {@render poolSection(pool)}
    {/each}
  {/if}
{/if}

{#snippet poolSection(pool: AccountPool)}
  {@const poolAccounts = accountsFor(pool)}
  <CollapsibleGroup
    label={pool.label}
    count={isOpen(pool.id) ? poolAccounts.length : pool.accountCount}
    open={isOpen(pool.id)}
    onToggle={(open) => setOpen(pool, open)}
  >
    {#snippet body()}
      {#if pool.error}
        <p class="error">{pool.providers[0].pluginName} failed to load, so these accounts cannot be managed: {pool.error}</p>
      {:else if accountErrors[pool.id]}
        <p class="error">Could not load accounts for {pool.label}: {accountErrors[pool.id]}</p>
      {:else}
        <div class="grouptools">
          <Button onclick={() => (addFor = { id: pool.controllerId, label: pool.label })}>
            {pool.accountCount > 0 ? "Add another" : "Add account"}
          </Button>
        </div>
        {#if loadingAccounts[pool.id] && poolAccounts.length === 0}
          <div class="skeletons">
            {#each Array(Math.min(pool.accountCount || 1, 3)) as _}
              <Skeleton height="64px" radius="10px" />
            {/each}
          </div>
        {:else if poolAccounts.length === 0}
          <p class="empty">{searching ? "No accounts match your search." : "No accounts yet."}</p>
        {:else}
          <ItemList
            items={poolAccounts}
            key={(account) => account.id}
            rowHeight={ACCOUNT_ROW_HEIGHT}
            virtualizeAfter={VIRTUALIZE_THRESHOLD}
          >
            {#snippet item(account)}{@render accountRow(pool, account)}{/snippet}
          </ItemList>
        {/if}
      {/if}
    {/snippet}
  </CollapsibleGroup>
{/snippet}

{#snippet accountRow(pool: AccountPool, account: AccountView)}
  <AccountRow
    label={accountLabel(account)}
    detail={account.detail ?? ""}
    status={accountStatusInfo(account)}
    enabled={account.enabled}
    quota={account.quota ?? []}
    onToggle={(on) => handleToggle(pool, account.id, on)}
    onRemove={() => confirmRemove(pool, account)}
  />
{/snippet}

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

{#if addFor}
  <AddAccountDialog
    provider={addFor}
    onClose={() => (addFor = null)}
    onAdded={() => {
      const pool = pools.find((candidate) => candidate.controllerId === addFor?.id);
      addFor = null;
      if (pool) void loadAccounts(pool);
      void load();
    }}
  />
{/if}

<style>
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 20px;
  }
  .head h1 {
    margin: 0;
    font-size: 20px;
    letter-spacing: -.02em;
    font-weight: 650;
  }
  .head p {
    margin: 3px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 18px;
    flex-wrap: wrap;
  }
  .picker {
    position: relative;
    flex: none;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 20;
    min-width: 180px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* The list is every installed provider, so it filters and scrolls rather than growing
     the menu past the window. */
  .menuscroll {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 280px;
    overflow-y: auto;
  }
  .filter {
    font-family: var(--ui);
    font-size: 12px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    margin-bottom: 6px;
  }
  .filter:focus {
    outline: none;
    border-color: var(--accent);
  }
  .menu button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 12.5px;
    color: var(--text);
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--surface-2);
  }
  .mlabel {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mcount {
    flex: none;
    font-size: 10.5px;
    color: var(--muted);
    background: var(--surface-2);
    border-radius: 999px;
    padding: 1px 6px;
  }
  .mempty {
    margin: 0;
    padding: 7px 10px;
    font-size: 12px;
    color: var(--muted);
  }
  .grouptools {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
  }
  .skeletons {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .empty {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
