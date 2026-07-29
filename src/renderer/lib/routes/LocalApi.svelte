<script lang="ts">
  import { onMount } from "svelte";
  import type { ProxyStatus } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import Card from "../components/Card.svelte";
  import Button from "../components/Button.svelte";
  import StatusPill from "../components/StatusPill.svelte";
  import Skeleton from "../components/Skeleton.svelte";
  import PageHeader from "../components/PageHeader.svelte";
  import ToggleSwitch from "../components/ToggleSwitch.svelte";

  const ENDPOINTS = [
    { path: "/v1/messages", desc: "Anthropic Messages API" },
    { path: "/v1/models", desc: "Available models" },
    { path: "/health", desc: "Health probe" },
  ];

  let status = $state<ProxyStatus | null>(null);
  let loadError = $state("");
  let actionError = $state("");
  let busy = $state(false);
  let autostart = $state(false);
  let copied = $state<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const baseUrl = $derived(status ? `http://127.0.0.1:${status.port}` : "");

  async function load(): Promise<void> {
    const result = await cairn.proxyStatus();
    if (result.ok) {
      status = result.data;
      loadError = "";
    } else {
      loadError = result.error;
    }
  }

  async function loadAutostart(): Promise<void> {
    const result = await cairn.getConfig("cairn", "proxyAutostart");
    autostart = result.ok && result.data === true;
  }

  async function toggle(): Promise<void> {
    if (busy || !status) return;
    busy = true;
    try {
      const result = status.running ? await cairn.proxyStop() : await cairn.proxyStart();
      if (!result.ok) {
        actionError = result.error;
        return;
      }
      actionError = "";
      await load();
    } finally {
      busy = false;
    }
  }

  async function setAutostart(on: boolean): Promise<void> {
    autostart = on;
    await cairn.setConfig("cairn", "proxyAutostart", on);
  }

  async function copy(text: string, id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copied = id;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = null), 1400);
    } catch {
      // clipboard unavailable; nothing to surface
    }
  }

  onMount(() => {
    load();
    loadAutostart();
  });
</script>

<PageHeader title="Local API" subtitle="Controls the local proxy that Claude Code and OpenCode connect through." />

{#if loadError}
  <p class="error">Could not load the local API status: {loadError}</p>
{:else if status}
  <Card>
    <div class="row">
      <div class="info">
        <StatusPill variant={status.running ? "good" : "off"} label={status.running ? "Running" : "Stopped"} />
        <div class="meta">
          <p class="port">{status.port}</p>
          <button class="url" title="Copy base URL" onclick={() => copy(baseUrl, "base")}>
            {baseUrl}<span class="copy">{copied === "base" ? "copied" : "copy"}</span>
          </button>
        </div>
      </div>
      <Button variant="primary" disabled={busy} onclick={toggle}>
        {status.running ? "Stop" : "Start local API"}
      </Button>
    </div>
    {#if actionError}
      <p class="error">{actionError}</p>
    {/if}
  </Card>

  <section class="panel">
    <p class="ptitle">Options</p>
    <Card>
      <div class="optrow">
        <div class="optlabel">
          <span class="k">Start on launch</span>
          <span class="desc">Autostart the local API when Cairn opens.</span>
        </div>
        <ToggleSwitch checked={autostart} label="Start on launch" onchange={setAutostart} />
      </div>
    </Card>
  </section>

  <section class="panel">
    <p class="ptitle">Endpoints</p>
    <Card>
      <ul class="endpoints">
        {#each ENDPOINTS as ep (ep.path)}
          <li>
            <button class="ep" title="Copy endpoint" onclick={() => copy(baseUrl + ep.path, ep.path)}>
              <span class="path">{baseUrl}{ep.path}</span>
              <span class="epdesc">{ep.desc}</span>
              <span class="copy">{copied === ep.path ? "copied" : "copy"}</span>
            </button>
          </li>
        {/each}
      </ul>
    </Card>
  </section>

  <section class="panel">
    <p class="ptitle">Connecting your apps</p>
    <Card>
      <div class="connect">
        <p>Point a client at the local API by exporting its base URL:</p>
        <button class="snippet" title="Copy" onclick={() => copy(`ANTHROPIC_BASE_URL=${baseUrl}`, "env")}>
          <code>ANTHROPIC_BASE_URL={baseUrl}</code>
          <span class="copy">{copied === "env" ? "copied" : "copy"}</span>
        </button>
      </div>
    </Card>
  </section>
{:else}
  <Skeleton height="72px" radius="12px" />
{/if}

<style>
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
    min-width: 0;
  }
  .meta .port {
    margin: 0;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
  }
  .url {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--faint);
  }
  .url:hover {
    color: var(--muted);
  }
  .copy {
    font-size: 9.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--accent);
    border: 1px solid var(--accent-border);
    border-radius: 5px;
    padding: 1px 5px;
    flex: none;
  }
  .panel {
    margin-top: 20px;
  }
  .ptitle {
    margin: 0 0 10px 2px;
    font-size: 10.5px;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .optrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 18px;
  }
  .optlabel {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .optlabel .k {
    font-size: 13px;
    font-weight: 600;
  }
  .optlabel .desc {
    font-size: 11.5px;
    color: var(--muted);
  }
  .endpoints {
    list-style: none;
    margin: 0;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .ep {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    border-radius: 8px;
    padding: 9px 12px;
    cursor: pointer;
    color: var(--text);
  }
  .ep:hover {
    background: var(--surface-2);
  }
  .ep .path {
    font-family: var(--mono);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .ep .epdesc {
    font-size: 11.5px;
    color: var(--faint);
    margin-left: auto;
    flex: none;
  }
  .connect {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .connect p {
    margin: 0;
    font-size: 12.5px;
    color: var(--muted);
  }
  .snippet {
    display: flex;
    align-items: center;
    gap: 12px;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
    cursor: pointer;
  }
  .snippet:hover {
    border-color: var(--border-strong);
  }
  .snippet code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .error {
    color: var(--crit);
    font-size: 13px;
  }
</style>
