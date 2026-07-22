<script lang="ts">
  import { onMount } from "svelte";
  import type { UsageSnapshot, UsageSession, UsageModel } from "@dashboard/shared";
  import { cairn } from "../ipc.js";
  import StatCard from "../components/StatCard.svelte";
  import Card from "../components/Card.svelte";

  let snapshot = $state<UsageSnapshot | null>(null);
  let loadError = $state("");

  const providerCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const account of snapshot?.accounts ?? []) {
      counts.set(account.provider, (counts.get(account.provider) ?? 0) + 1);
    }
    return [...counts.entries()];
  });

  const sessions = $derived(snapshot?.sessions ?? []);
  const modelEntries = $derived(Object.entries(snapshot?.models ?? {}));
  const totalTokens = $derived(sessions.reduce((sum, session) => sum + sessionTokens(session), 0));

  function sessionTokens(session: UsageSession): number {
    return session.tokens.input + session.tokens.output + session.tokens.reasoning;
  }

  function modelTokens(model: UsageModel): number {
    return model.tokens.input + model.tokens.output + model.tokens.reasoning;
  }

  function sourceLabel(source: UsageSession["source"]): string {
    return source === "claude-code" ? "Claude Code" : "OpenCode";
  }

  function formatUpdatedAt(value: string): string {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
  }

  function formatSessionUpdated(value: number): string {
    if (!value) return "n/a";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "n/a" : date.toISOString().slice(0, 10);
  }

  function formatTokens(value: number): string {
    return value.toLocaleString("en-US");
  }

  onMount(async () => {
    const result = await cairn.usageSnapshot();
    if (result.ok) snapshot = result.data;
    else loadError = result.error;
  });
</script>

<div class="head">
  <div>
    <h1>Usage</h1>
    <p>Account coverage, session activity, and per-model token totals across providers.</p>
  </div>
</div>

{#if loadError}
  <p class="error">Could not load usage: {loadError}</p>
{:else if snapshot}
  <section class="summary">
    <StatCard label="Accounts tracked" value={String(snapshot.accounts.length)} />
    <StatCard label="Sessions" value={String(sessions.length)} />
    <StatCard label="Total tokens" value={formatTokens(totalTokens)} />
    <StatCard label="Last updated" value={formatUpdatedAt(snapshot.updatedAt)} />
  </section>

  <section class="group">
    <div class="grouphead">
      <p class="label">Accounts by provider</p>
      <span class="count">{snapshot.accounts.length}</span>
      <span class="line"></span>
    </div>
    <Card>
      <div class="list">
        {#each providerCounts as [provider, count] (provider)}
          <div class="row-line">
            <span class="primary">{provider}</span>
            <span class="meta">{count} account{count === 1 ? "" : "s"}</span>
          </div>
        {:else}
          <p class="empty">No accounts yet</p>
        {/each}
      </div>
    </Card>
  </section>

  <section class="group">
    <div class="grouphead">
      <p class="label">Sessions</p>
      <span class="count">{sessions.length}</span>
      <span class="line"></span>
    </div>
    <Card>
      <div class="list">
        {#each sessions as session (session.id)}
          <div class="row-line">
            <span class="primary">{session.title}</span>
            <span class="meta"
              >{sourceLabel(session.source)} &middot; {formatTokens(sessionTokens(session))} tokens &middot; {session.messageCount} message{session.messageCount ===
              1
                ? ""
                : "s"} &middot; {formatSessionUpdated(session.updated)}</span
            >
          </div>
        {:else}
          <p class="empty">No sessions found</p>
        {/each}
      </div>
    </Card>
  </section>

  <section class="group">
    <div class="grouphead">
      <p class="label">Models</p>
      <span class="count">{modelEntries.length}</span>
      <span class="line"></span>
    </div>
    <Card>
      <div class="list">
        {#each modelEntries as [modelId, model] (modelId)}
          <div class="row-line">
            <span class="primary">{modelId}</span>
            <span class="meta"
              >{model.provider} &middot; {formatTokens(modelTokens(model))} tokens &middot; {model.sessionCount} session{model.sessionCount ===
              1
                ? ""
                : "s"}</span
            >
          </div>
        {:else}
          <p class="empty">No model usage yet</p>
        {/each}
      </div>
    </Card>
  </section>
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
    max-width: 560px;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 22px;
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
  .list {
    padding: 4px 16px;
  }
  .row-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-top: 1px solid var(--border);
  }
  .row-line:first-child {
    border-top: 0;
  }
  .row-line .primary {
    font-weight: 600;
    font-size: 13px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-line .meta {
    color: var(--faint);
    font-size: 11.5px;
    font-family: var(--mono);
    white-space: nowrap;
    flex: none;
  }
  .empty {
    color: var(--faint);
    font-size: 12.5px;
    padding: 14px 16px;
    margin: 0;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
