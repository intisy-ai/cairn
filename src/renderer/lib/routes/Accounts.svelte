<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, AccountView, AccountStatus } from "@cairn/shared";
  import type { StatusVariant } from "../components/StatusPill.svelte";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import { debounce } from "../util/debounce.js";
  import AccountRow from "../components/AccountRow.svelte";
  import Card from "../components/Card.svelte";
  import SearchField from "../components/SearchField.svelte";
  import CollapsibleGroup from "../components/CollapsibleGroup.svelte";
  import VirtualList from "../components/VirtualList.svelte";
  import Skeleton from "../components/Skeleton.svelte";

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

  onMount(() => {
    load().finally(() => (loaded = true));
  });
</script>

<div class="head">
  <div>
    <h1>Accounts</h1>
    <p>Signed-in accounts across every provider, with quota and status at a glance.</p>
  </div>
</div>

{#if providersError}
  <p class="error">Could not load providers: {providersError}</p>
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
    onRemove={() => handleRemove(providerId, account.id)}
  />
{/snippet}

<style>
  .head {
    display: flex;
    align-items: flex-start;
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
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
