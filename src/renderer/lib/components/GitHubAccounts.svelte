<script lang="ts">
  import { onMount } from "svelte";
  import type { GithubStatus } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { githubChanged, bumpGithub } from "../githubStore.js";
  import Button from "./Button.svelte";

  let status = $state<GithubStatus | null>(null);
  let busy = $state(false);
  let error = $state("");
  let addOpen = $state(false);
  let tokenDraft = $state("");

  async function refresh(): Promise<void> {
    const result = await cairn.githubStatus();
    if (result.ok) status = result.data;
  }

  onMount(refresh);

  // Every mutation below calls bumpGithub() itself, so the first fire of this
  // effect (right after onMount's own refresh) would be a redundant reload.
  let sawInitialChange = false;
  $effect(() => {
    $githubChanged;
    if (!sawInitialChange) {
      sawInitialChange = true;
      return;
    }
    refresh();
  });

  const ghCliPrompt = $derived.by(() => {
    const s = status;
    if (!s || !s.ghCli) return null;
    const ghCli = s.ghCli;
    return s.accounts.some((a) => a.login === ghCli.login) ? null : ghCli;
  });

  function sourceLine(s: GithubStatus): string {
    if (s.source === "env") return "Connected via environment variable";
    if (s.source === "gh") return "Connected via GitHub CLI";
    return "";
  }

  function initialOf(label: string): string {
    return label.charAt(0).toUpperCase();
  }

  async function logoutActive(): Promise<void> {
    if (!status?.activeLogin || busy) return;
    busy = true;
    try {
      await cairn.githubRemoveAccount(status.activeLogin);
      await refresh();
      bumpGithub();
    } finally {
      busy = false;
    }
  }

  async function connectGhCli(): Promise<void> {
    if (busy) return;
    busy = true;
    error = "";
    try {
      const result = await cairn.githubConnectGhCli();
      if (result.ok) {
        await refresh();
        bumpGithub();
      } else {
        error = result.error;
      }
    } finally {
      busy = false;
    }
  }

  async function switchAccount(login: string): Promise<void> {
    if (busy || login === status?.activeLogin) return;
    busy = true;
    try {
      await cairn.githubSwitchAccount(login);
      await refresh();
      bumpGithub();
    } finally {
      busy = false;
    }
  }

  async function removeAccount(login: string): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await cairn.githubRemoveAccount(login);
      await refresh();
      bumpGithub();
    } finally {
      busy = false;
    }
  }

  function openAdd(): void {
    addOpen = true;
    error = "";
    tokenDraft = "";
  }

  function cancelAdd(): void {
    addOpen = false;
    tokenDraft = "";
    error = "";
  }

  async function saveAdd(): Promise<void> {
    const token = tokenDraft.trim();
    if (!token || busy) return;
    busy = true;
    error = "";
    try {
      const result = await cairn.githubAddAccount(token);
      if (result.ok) {
        addOpen = false;
        tokenDraft = "";
        await refresh();
        bumpGithub();
      } else {
        error = result.error;
      }
    } finally {
      busy = false;
    }
  }
</script>

{#if status}
  <div class="ghaccounts">
    {#if status.connected}
      <div class="identity">
        <span class="avatar" aria-hidden="true">
          {#if status.avatarUrl}
            <img src={status.avatarUrl} alt="" />
          {:else}
            <span class="lettermark">{initialOf(status.name ?? status.login ?? "?")}</span>
          {/if}
        </span>
        <div class="idinfo">
          <span class="name">{status.name ?? (status.login ? `@${status.login}` : "Connected")}</span>
          {#if status.login}<span class="login">@{status.login}</span>{/if}
          {#if sourceLine(status)}<span class="hint">{sourceLine(status)}</span>{/if}
        </div>
        {#if status.source === "config"}
          <Button variant="danger" disabled={busy} onclick={logoutActive}>Log out</Button>
        {/if}
      </div>
    {:else}
      <div class="identity off">
        <div class="idinfo">
          <span class="name">Not connected</span>
          <span class="hint">Add an account to enable the marketplace catalog.</span>
        </div>
      </div>
    {/if}

    {#if ghCliPrompt}
      <div class="ghcli">
        <span>Signed in to GitHub CLI as @{ghCliPrompt.login}. Connect it to Cairn?</span>
        <Button disabled={busy} onclick={connectGhCli}>Connect</Button>
      </div>
    {/if}

    {#if status.accounts.length > 0}
      <div class="accounts">
        {#each status.accounts as account (account.login)}
          <div class="account" class:active={account.login === status.activeLogin}>
            <button
              class="accountbtn"
              disabled={busy || account.login === status.activeLogin}
              onclick={() => switchAccount(account.login)}
            >
              <span class="aavatar" aria-hidden="true">
                {#if account.avatarUrl}
                  <img src={account.avatarUrl} alt="" />
                {:else}
                  <span class="lettermark small">{initialOf(account.name ?? account.login)}</span>
                {/if}
              </span>
              <span class="ainfo">
                <span class="aname">{account.name ?? `@${account.login}`}</span>
                <span class="alogin">@{account.login}</span>
              </span>
              {#if account.login === status.activeLogin}<span class="check" aria-hidden="true">✓</span>{/if}
            </button>
            <button
              class="remove"
              title={`Log out @${account.login}`}
              aria-label={`Log out @${account.login}`}
              disabled={busy}
              onclick={() => removeAccount(account.login)}
            >
              ×
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="add">
      {#if addOpen}
        <div class="addform">
          <input
            type="password"
            class="token"
            placeholder="Personal access token"
            aria-label="GitHub personal access token"
            bind:value={tokenDraft}
          />
          <div class="addactions">
            <Button variant="primary" disabled={busy || !tokenDraft.trim()} onclick={saveAdd}>Save</Button>
            <Button disabled={busy} onclick={cancelAdd}>Cancel</Button>
          </div>
          <span class="hint">Paste a GitHub personal access token (read access to repositories).</span>
        </div>
      {:else}
        <Button onclick={openAdd}>Add account</Button>
      {/if}
      {#if error}<div class="error">{error}</div>{/if}
    </div>
  </div>
{/if}

<style>
  .ghaccounts {
    display: flex;
    flex-direction: column;
    padding: 12px 14px;
  }
  .identity {
    display: flex;
    align-items: center;
    gap: 10px;
    padding-bottom: 10px;
  }
  .identity.off {
    padding-bottom: 6px;
  }
  .avatar,
  .lettermark {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
  }
  .avatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .lettermark {
    display: grid;
    place-items: center;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 14px;
    font-weight: 700;
  }
  .idinfo {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .name {
    font-size: 13px;
    font-weight: 650;
    letter-spacing: -.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .login {
    font-size: 11.5px;
    color: var(--muted);
  }
  .hint {
    font-size: 11px;
    color: var(--faint);
  }
  .ghcli {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 10px;
    margin-bottom: 10px;
    border-radius: 8px;
    background: var(--accent-weak);
    font-size: 11.5px;
    color: var(--text);
  }
  .accounts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .account {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .accountbtn {
    all: unset;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    border-radius: 7px;
    cursor: pointer;
    min-width: 0;
  }
  .accountbtn:hover:not(:disabled) {
    background: var(--surface-2);
  }
  .accountbtn:disabled {
    cursor: default;
  }
  .account.active .accountbtn .aname {
    font-weight: 650;
  }
  .aavatar {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 50%;
  }
  .aavatar img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }
  .lettermark.small {
    width: 100%;
    height: 100%;
    font-size: 10px;
  }
  .ainfo {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    flex: 1;
    text-align: left;
  }
  .aname {
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .alogin {
    font-size: 10.5px;
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .check {
    flex: none;
    color: var(--good);
    font-size: 11px;
  }
  .remove {
    all: unset;
    flex: none;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    cursor: pointer;
    color: var(--faint);
    font-size: 14px;
    line-height: 1;
  }
  .remove:hover:not(:disabled) {
    background: var(--crit-weak);
    color: var(--crit);
  }
  .add {
    padding-top: 10px;
    border-top: 1px solid var(--border);
    margin-top: 2px;
  }
  .addform {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .token {
    font-family: var(--ui);
    font-size: 12px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 7px 9px;
  }
  .token:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .addactions {
    display: flex;
    gap: 6px;
  }
  .error {
    margin-top: 8px;
    font-size: 11px;
    color: var(--crit);
  }
</style>
