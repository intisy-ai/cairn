<script lang="ts">
  import { onMount } from "svelte";
  import type { GithubStatus } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import StatusPill from "./StatusPill.svelte";
  import Button from "./Button.svelte";

  let { onChanged }: { onChanged?: () => void } = $props();

  let status = $state<GithubStatus | null>(null);
  let tokenDraft = $state("");
  let busy = $state(false);

  async function refresh(): Promise<void> {
    const result = await cairn.githubStatus();
    if (result.ok) status = result.data;
  }

  async function save(): Promise<void> {
    const token = tokenDraft.trim();
    if (!token || busy) return;
    busy = true;
    try {
      await cairn.githubSetToken(token);
      tokenDraft = "";
      await refresh();
      onChanged?.();
    } finally {
      busy = false;
    }
  }

  async function disconnect(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await cairn.githubSetToken("");
      await refresh();
      onChanged?.();
    } finally {
      busy = false;
    }
  }

  function sourceHint(s: GithubStatus): string {
    if (s.source === "gh") return "via local gh CLI";
    if (s.source === "config" || s.source === "env") return "via token";
    return "";
  }

  onMount(refresh);
</script>

{#if status}
  <div class="gh-row">
    <div class="gh-status">
      {#if status.connected}
        <StatusPill variant="good" label={status.login ? `@${status.login}` : "Connected"} />
        <span class="hint">{sourceHint(status)}</span>
      {:else}
        <StatusPill variant="warn" label="Not connected" />
        <span class="hint">
          Logos and rich catalog data need a GitHub token.
          {#if status.ghCliDetected}Local gh CLI detected.{/if}
        </span>
      {/if}
    </div>
    <div class="gh-action">
      {#if status.connected}
        <Button onclick={disconnect} disabled={busy}>Disconnect</Button>
      {:else}
        <input
          type="password"
          class="gh-token"
          placeholder="Paste a GitHub token"
          aria-label="GitHub token"
          bind:value={tokenDraft}
        />
        <Button variant="primary" onclick={save} disabled={busy || !tokenDraft.trim()}>Save</Button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .gh-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 14px;
    margin: 0 2px 12px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 10px;
    flex-wrap: wrap;
  }
  .gh-status {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .hint {
    color: var(--faint);
    font-size: 11.5px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .gh-action {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .gh-token {
    font-family: var(--ui);
    font-size: 12.5px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 7px 10px;
    width: 200px;
  }
  .gh-token:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
</style>
