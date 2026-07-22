<script lang="ts">
  import { onMount } from "svelte";
  import type { ProviderRow as ProviderRowData, AccountView, AccountStatus } from "@dashboard/shared";
  import type { StatusVariant } from "../components/StatusPill.svelte";
  import { cairn } from "../ipc.js";
  import AccountRow from "../components/AccountRow.svelte";
  import Button from "../components/Button.svelte";
  import Card from "../components/Card.svelte";

  const STATUS_INFO: Record<AccountStatus, { variant: StatusVariant; label: string }> = {
    active: { variant: "good", label: "Active" },
    "rate-limited": { variant: "warn", label: "Rate limited" },
    "cooling-down": { variant: "warn", label: "Cooling down" },
    "verification-required": { variant: "warn", label: "Verification required" },
    disabled: { variant: "off", label: "Disabled" },
  };

  let providers = $state<ProviderRowData[]>([]);
  let providersError = $state("");
  let accountsByProvider = $state<Record<string, AccountView[]>>({});
  let accountErrors = $state<Record<string, string>>({});

  function statusFor(account: AccountView): { variant: StatusVariant; label: string } {
    return STATUS_INFO[account.status];
  }

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
    await cairn.accountsEnable(providerId, id, on);
    await loadAccounts(providerId);
  }

  async function handleRemove(providerId: string, id: string): Promise<void> {
    await cairn.accountsRemove(providerId, id);
    await loadAccounts(providerId);
  }

  onMount(load);
</script>

<div class="head">
  <div>
    <h1>Accounts</h1>
    <p>Signed-in accounts across every provider, with quota and status at a glance.</p>
  </div>
</div>

{#if providersError}
  <p class="error">Could not load providers: {providersError}</p>
{:else}
  {#each providers as provider (provider.id)}
    <section class="group">
      <div class="grouphead">
        <p class="label">{provider.label}</p>
        <span class="count">{(accountsByProvider[provider.id] ?? []).length}</span>
        <span class="line"></span>
        <Button disabled title="Login flow not wired up yet">+ Add account</Button>
      </div>
      {#if accountErrors[provider.id]}
        <p class="error">Could not load accounts for {provider.label}: {accountErrors[provider.id]}</p>
      {:else}
        <Card>
          {#each accountsByProvider[provider.id] ?? [] as account (account.id)}
            <AccountRow
              label={account.email ?? account.id}
              detail={account.detail ?? ""}
              status={statusFor(account)}
              enabled={account.enabled}
              quota={account.quota ?? []}
              onToggle={(on) => handleToggle(provider.id, account.id, on)}
              onRemove={() => handleRemove(provider.id, account.id)}
            />
          {/each}
        </Card>
      {/if}
    </section>
  {/each}
{/if}

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
  .group {
    margin-bottom: 26px;
  }
  .grouphead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 10px;
  }
  .grouphead .label {
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
    margin: 0;
  }
  .grouphead .count {
    font-size: 11px;
    color: var(--faint);
    font-family: var(--mono);
  }
  .grouphead .line {
    flex: 1;
    height: 1px;
    background: var(--border);
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
