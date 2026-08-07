<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, AccountView } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import { accountLabel, accountStatusInfo } from "../util/accountStatus.js";
  import AccountRow from "../components/AccountRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import CollapsibleGroup from "../components/CollapsibleGroup.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import ErrorState from "../components/ErrorState.svelte";
  import AddAccountDialog from "../components/AddAccountDialog.svelte";

  const VIRTUALIZE_THRESHOLD = 20;
  const ACCOUNT_ROW_HEIGHT = 64;

  let providers = $state<ProviderRowData[]>([]);
  let providersError = $state("");
  let loaded = $state(false);
  let accountsByProvider = $state<Record<string, AccountView[]>>({});
  let accountErrors = $state<Record<string, string>>({});
  let loadingAccounts = $state<Record<string, boolean>>({});
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

  // A provider's account count comes with the provider row, so the screen knows which ones
  // are worth a section without listing anybody's accounts first. Only the providers you
  // actually signed into get one; the rest are reached through Add account or by searching.
  const connected = $derived(providers.filter((provider) => provider.accountCount > 0));

  const visibleProviders = $derived.by(() => {
    if (!term) return connected;
    return providers.filter((provider) =>
      provider.label.toLowerCase().includes(term)
      || (accountsByProvider[provider.id] ?? []).some((account) => accountLabel(account).toLowerCase().includes(term)));
  });

  const totalAccounts = $derived(providers.reduce((sum, provider) => sum + provider.accountCount, 0));

  const pickerProviders = $derived.by(() => {
    const filter = pickerFilter.trim().toLowerCase();
    return filter ? providers.filter((provider) => provider.label.toLowerCase().includes(filter)) : providers;
  });

  // Matching a provider by name means every one of its accounts matched too, otherwise
  // searching for a provider would show its section with nothing in it.
  function accountsFor(provider: ProviderRowData): AccountView[] {
    const accounts = accountsByProvider[provider.id] ?? [];
    if (!term || provider.label.toLowerCase().includes(term)) return accounts;
    return accounts.filter((account) => accountLabel(account).toLowerCase().includes(term));
  }

  async function loadAccounts(providerId: string): Promise<void> {
    loadingAccounts[providerId] = true;
    const result = await cairn.accountsList(providerId);
    loadingAccounts[providerId] = false;
    if (!result.ok) {
      accountErrors[providerId] = result.error;
      return;
    }
    accountsByProvider[providerId] = result.data;
    accountErrors[providerId] = "";
    // Keeps the count that decides whether this provider has a section at all in step with
    // what was just listed, so removing the last account retires the section without a
    // second round trip for every other provider.
    const provider = providers.find((row) => row.id === providerId);
    if (provider) provider.accountCount = result.data.length;
  }

  function ensureAccounts(providerId: string): void {
    if (requested.has(providerId)) return;
    requested.add(providerId);
    void loadAccounts(providerId);
  }

  $effect(() => {
    for (const provider of visibleProviders) ensureAccounts(provider.id);
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

  async function handleToggle(providerId: string, id: string, on: boolean): Promise<void> {
    const result = await cairn.accountsEnable(providerId, id, on);
    if (!result.ok) toast.error(result.error);
    await loadAccounts(providerId);
  }

  async function handleRemove(providerId: string, id: string): Promise<void> {
    const result = await cairn.accountsRemove(providerId, id);
    if (result.ok) {
      toast.success("Account removed");
    } else {
      toast.error(result.error);
    }
    await loadAccounts(providerId);
  }

  function confirmRemove(providerId: string, account: AccountView): void {
    pendingConfirm = {
      title: "Remove account?",
      message: `Remove ${accountLabel(account)}? You'll need to sign in again to use it.`,
      confirmLabel: "Remove",
      run: () => handleRemove(providerId, account.id),
    };
  }

  function openPicker(): void {
    pickerFilter = "";
    pickerOpen = !pickerOpen;
  }

  function pickProvider(provider: ProviderRowData): void {
    pickerOpen = false;
    addFor = { id: provider.id, label: provider.label };
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
        across {connected.length} of {providers.length} {providers.length === 1 ? "provider" : "providers"}.
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
            {#each pickerProviders as provider (provider.id)}
              <button role="menuitem" onclick={() => pickProvider(provider)}>
                <span class="mlabel">{provider.label}</span>
                {#if provider.accountCount > 0}<span class="mcount">{provider.accountCount}</span>{/if}
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

  {#each visibleProviders as provider (provider.id)}
    {@const providerAccounts = accountsFor(provider)}
    <CollapsibleGroup label={provider.label} count={providerAccounts.length}>
      {#snippet body()}
        {#if accountErrors[provider.id]}
          <p class="error">Could not load accounts for {provider.label}: {accountErrors[provider.id]}</p>
        {:else}
          <div class="grouptools">
            <Button onclick={() => (addFor = { id: provider.id, label: provider.label })}>
              {provider.accountCount > 0 ? "Add another" : "Add account"}
            </Button>
          </div>
          {#if loadingAccounts[provider.id] && providerAccounts.length === 0}
            <div class="skeletons">
              {#each Array(Math.min(provider.accountCount || 1, 3)) as _}
                <Skeleton height="64px" radius="10px" />
              {/each}
            </div>
          {:else if providerAccounts.length === 0}
            <p class="empty">{searching ? "No accounts match your search." : "No accounts yet."}</p>
          {:else}
            <Card>
              {#if providerAccounts.length > VIRTUALIZE_THRESHOLD}
                <VirtualList items={providerAccounts} rowHeight={ACCOUNT_ROW_HEIGHT}>
                  {#snippet row(account)}
                    {@render accountRow(provider.id, account)}
                  {/snippet}
                </VirtualList>
              {:else}
                {#each providerAccounts as account (account.id)}
                  {@render accountRow(provider.id, account)}
                {/each}
              {/if}
            </Card>
          {/if}
        {/if}
      {/snippet}
    </CollapsibleGroup>
  {:else}
    <p class="empty">
      {searching
        ? "No account or provider matches your search."
        : "No accounts yet. Use Add account to sign in to a provider."}
    </p>
  {/each}
{/if}

{#snippet accountRow(providerId: string, account: AccountView)}
  <AccountRow
    label={accountLabel(account)}
    detail={account.detail ?? ""}
    status={accountStatusInfo(account)}
    enabled={account.enabled}
    quota={account.quota ?? []}
    onToggle={(on) => handleToggle(providerId, account.id, on)}
    onRemove={() => confirmRemove(providerId, account)}
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
    onAdded={() => { const id = addFor?.id; addFor = null; if (id) { void loadAccounts(id); } void load(); }}
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
