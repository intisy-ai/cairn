<script lang="ts">
  import { onMount } from "svelte";
  import type { GithubStatus } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { bumpGithub } from "../githubStore.js";

  let status = $state<GithubStatus | null>(null);
  let open = $state(false);
  let tokenDraft = $state("");
  let busy = $state(false);
  let error = $state("");

  let root = $state<HTMLElement | null>(null);
  function onWindowClick(e: MouseEvent): void {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") open = false;
  }

  async function refresh(): Promise<void> {
    const result = await cairn.githubStatus();
    if (result.ok) status = result.data;
  }

  function toggle(): void {
    open = !open;
  }

  function sourceHint(s: GithubStatus): string {
    if (s.source === "gh") return "via local gh CLI";
    if (s.source === "config" || s.source === "env") return "via token";
    return "";
  }

  async function addAccount(): Promise<void> {
    const token = tokenDraft.trim();
    if (!token || busy) return;
    busy = true;
    error = "";
    try {
      const result = await cairn.githubAddAccount(token);
      if (result.ok) {
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

  onMount(refresh);
</script>

<svelte:window onclick={onWindowClick} onkeydown={onKey} />

<div class="ghmenu" bind:this={root}>
  <button
    class="iconbtn"
    title={status?.connected ? `@${status.login ?? ""}` : "Not connected to GitHub"}
    aria-label="GitHub connection"
    onclick={toggle}
  >
    <svg class="mark" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
    <span class="dot" class:on={status?.connected}></span>
  </button>

  {#if open && status}
    <div class="panel">
      {#if status.connected}
        <div class="head">
          <span class="login">@{status.login ?? "unknown"}</span>
          <span class="hint">{sourceHint(status)}</span>
        </div>
      {:else}
        <div class="head">
          <span class="login off">Not connected</span>
          <span class="hint">
            Logos and rich catalog data need a GitHub token.
            {#if status.ghCliDetected}Local gh CLI detected.{/if}
          </span>
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
                <span class="check" aria-hidden="true">{account.login === status.activeLogin ? "✓" : ""}</span>
                <span class="alogin">@{account.login}</span>
              </button>
              <button
                class="remove"
                title={`Remove @${account.login}`}
                aria-label={`Remove @${account.login}`}
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
        <input type="password" class="token" placeholder="Paste a GitHub token" aria-label="GitHub token" bind:value={tokenDraft} />
        <button class="addbtn" disabled={busy || !tokenDraft.trim()} onclick={addAccount}>Add</button>
      </div>
      {#if error}<div class="error">{error}</div>{/if}
    </div>
  {/if}
</div>

<style>
  .ghmenu {
    position: relative;
    -webkit-app-region: no-drag;
  }
  .iconbtn {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    padding: 0;
    -webkit-app-region: no-drag;
  }
  .iconbtn:hover {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
  .iconbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .mark {
    width: 14px;
    height: 14px;
  }
  .dot {
    position: absolute;
    bottom: 3px;
    right: 3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--faint);
    border: 1.5px solid var(--surface-2);
  }
  .dot.on {
    background: var(--good);
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 260px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 50;
    padding: 10px;
    -webkit-app-region: no-drag;
  }
  .head {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px 2px 8px;
  }
  .login {
    font-size: 12.5px;
    font-weight: 700;
  }
  .login.off {
    color: var(--muted);
  }
  .hint {
    font-size: 11px;
    color: var(--faint);
  }
  .accounts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
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
    gap: 6px;
    padding: 6px 6px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 12px;
    color: var(--muted);
    min-width: 0;
  }
  .accountbtn:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--text);
  }
  .accountbtn:disabled {
    cursor: default;
  }
  .account.active .accountbtn {
    color: var(--text);
    font-weight: 600;
  }
  .check {
    width: 12px;
    flex: none;
    color: var(--good);
    font-size: 11px;
  }
  .alogin {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    display: flex;
    align-items: center;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }
  .token {
    flex: 1;
    min-width: 0;
    font-family: var(--ui);
    font-size: 12px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 6px 8px;
  }
  .token:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .addbtn {
    flex: none;
    font-family: var(--ui);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 7px;
    padding: 6px 10px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
  }
  .addbtn:disabled {
    opacity: .5;
    cursor: not-allowed;
  }
  .error {
    margin-top: 6px;
    font-size: 11px;
    color: var(--crit);
  }
</style>
