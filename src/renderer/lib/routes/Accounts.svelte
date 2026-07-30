<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, AccountView, AccountStatus } from "@cairn/shared";
  import type { StatusVariant } from "../components/StatusPill.svelte";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
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

  const STATUS_INFO: Record<AccountStatus, { variant: StatusVariant; label: string }> = {
    active: { variant: "good", label: "Active" },
    "rate-limited": { variant: "warn", label: "Rate limited" },
    "cooling-down": { variant: "warn", label: "Cooling down" },
    "verification-required": { variant: "warn", label: "Verification required" },
    disabled: { variant: "off", label: "Disabled" },
  };

  const VIRTUALIZE_THRESHOLD = 20;
  const ACCOUNT_ROW_HEIGHT = 64;

  let providers = $state<ProviderRowData[]>([]);
  let providersError = $state("");
  let loaded = $state(false);
  let accountsByProvider = $state<Record<string, AccountView[]>>({});
  let accountErrors = $state<Record<string, string>>({});
  let searchRaw = $state("");
  let search = $state("");
  let pendingConfirm = $state<{ title: string; message: string; confirmLabel: string; run: () => Promise<void> } | null>(null);
  let addFor = $state<{ id: string; label: string } | null>(null);
  let pickerOpen = $state(false);

  const applySearch = debounce((value: string) => {
    search = value;
  }, 120);

  $effect(() => {
    applySearch(searchRaw);
  });

  function statusFor(account: AccountView): { variant: StatusVariant; label: string } {
    return STATUS_INFO[account.status];
  }

  function accountLabel(account: AccountView): string {
    return account.email ?? account.id;
  }

  function matchesSearch(provider: ProviderRowData, account: AccountView, term: string): boolean {
    if (!term) return true;
    if (provider.label.toLowerCase().includes(term)) return true;
    return accountLabel(account).toLowerCase().includes(term);
  }

  const searching = $derived(search.trim().length > 0);

  const filteredAccountsByProvider = $derived.by(() => {
    const term = search.trim().toLowerCase();
    const result: Record<string, AccountView[]> = {};
    for (const provider of providers) {
      const accounts = accountsByProvider[provider.id] ?? [];
      result[provider.id] = accounts.filter((account) => matchesSearch(provider, account, term));
    }
    return result;
  });

  async function loadAccounts(providerId: string): Promise<void> {
    const result = await cairn.accountsList(providerId);
    if (result.ok) {
      accountsByProvider[providerId] = result.data;
      accountErrors[providerId] = "";
    } else {
      accountErrors[providerId] = result.error;
    }
  }

  async function load(): Promise<void> {
    const result = await cairn.providersList();
    if (!result.ok) {
      providersError = result.error;
      providers = [];
      return;
    }
    providersError = "";
    providers = result.data;
    await Promise.all(providers.map((provider) => loadAccounts(provider.id)));
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

  function pickProvider(provider: ProviderRowData): void {
    pickerOpen = false;
    addFor = { id: provider.id, label: provider.label };
  }

  onMount(() => {
    load().finally(() => (loaded = true));
  });
</script>

<div class="head">
  <div>
    <h1>Accounts</h1>
    <p>Signed-in accounts across every provider, with quota and status at a glance.</p>
  </div>
  {#if loaded && !providersError && providers.length > 0}
    <div class="picker">
      <Button variant="primary" onclick={() => (pickerOpen = !pickerOpen)}>Add account</Button>
      {#if pickerOpen}
        <div class="menu" role="menu">
          {#each providers as provider (provider.id)}
            <button role="menuitem" onclick={() => pickProvider(provider)}>{provider.label}</button>
          {/each}
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

  {#each providers as provider (provider.id)}
    {@const providerAccounts = filteredAccountsByProvider[provider.id] ?? []}
    <CollapsibleGroup label={provider.label} count={providerAccounts.length}>
      {#snippet body()}
        {#if accountErrors[provider.id]}
          <p class="error">Could not load accounts for {provider.label}: {accountErrors[provider.id]}</p>
        {:else}
          <div class="grouptools">
            <Button onclick={() => (addFor = { id: provider.id, label: provider.label })}>Add account</Button>
          </div>
          {#if providerAccounts.length === 0}
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
  {/each}
{/if}

{#snippet accountRow(providerId: string, account: AccountView)}
  <AccountRow
    label={accountLabel(account)}
    detail={account.detail ?? ""}
    status={statusFor(account)}
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
    onAdded={() => { addFor = null; load(); }}
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
  .menu button {
    all: unset;
    box-sizing: border-box;
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
  .grouptools {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 8px;
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
