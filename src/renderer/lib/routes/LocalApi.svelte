<script lang="ts">
  import { onMount } from "svelte";
  import type { ProxyStatus } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import Card from "../components/Card.svelte";
  import Button from "../components/Button.svelte";
  import StatusPill from "../components/StatusPill.svelte";

  let status = $state<ProxyStatus | null>(null);
  let loadError = $state("");
  let busy = $state(false);

  async function load(): Promise<void> {
    const result = await cairn.proxyStatus();
    if (result.ok) {
      status = result.data;
      loadError = "";
    } else {
      loadError = result.error;
    }
  }

  async function toggle(): Promise<void> {
    if (busy || !status) return;
    busy = true;
    try {
      const result = status.running ? await cairn.proxyStop() : await cairn.proxyStart();
      if (!result.ok) {
        loadError = result.error;
        return;
      }
      await load();
    } finally {
      busy = false;
    }
  }

  onMount(load);
</script>

<div class="head">
  <div>
    <h1>Local API</h1>
    <p>Controls the local proxy that Claude Code and OpenCode connect through.</p>
  </div>
</div>

{#if loadError}
  <p class="error">Could not load the local API status: {loadError}</p>
{:else if status}
  <Card>
    <div class="row">
      <div class="info">
        <StatusPill variant={status.running ? "good" : "off"} label={status.running ? "Running" : "Stopped"} />
        <div class="meta">
          <p class="port">{status.port}</p>
          <p class="url">http://127.0.0.1:{status.port}</p>
        </div>
      </div>
      <Button variant="primary" disabled={busy} onclick={toggle}>
        {status.running ? "Stop" : "Start local API"}
      </Button>
    </div>
  </Card>
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
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
  }
  .info {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .meta .port {
    margin: 0;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
  }
  .meta .url {
    margin: 0;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
