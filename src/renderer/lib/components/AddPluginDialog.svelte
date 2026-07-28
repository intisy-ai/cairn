<script lang="ts">
  import type { CatalogKind } from "@cairn/shared";
  import { parseRepoRef, classifyRepoName } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import Button from "./Button.svelte";

  let { home, onClose, onInstalled }: { home: string; onClose: () => void; onInstalled: () => void } = $props();

  const KINDS: CatalogKind[] = ["provider", "proxy", "plugin"];

  let url = $state("");
  let kindOverride = $state<CatalogKind | "">("");
  let busy = $state(false);
  let error = $state("");

  const parsed = $derived(parseRepoRef(url));
  const autoKind = $derived(parsed ? classifyRepoName(parsed.repo) ?? "plugin" : null);
  const kind = $derived<CatalogKind | null>(kindOverride || autoKind);

  async function install(): Promise<void> {
    if (!parsed || busy) return;
    busy = true;
    error = "";
    const result = await track(`Install ${parsed.repo}`, home, () => cairn.pluginsInstall(home, parsed.repo, parsed.url));
    busy = false;
    if (result.ok) {
      onInstalled();
      onClose();
    } else {
      error = result.error;
    }
  }
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="dialog" role="dialog" aria-label="Add a plugin from a URL">
  <h3>Add from URL</h3>
  <p class="hint">Install any provider, proxy, or plugin from a GitHub repository. A repository that does not follow the plugin contract installs but will not be picked up.</p>
  <input class="url" placeholder="owner/repo or GitHub URL" aria-label="Repository URL" bind:value={url} />
  {#if parsed}
    <div class="preview">
      <span class="name">{parsed.repo}</span>
      {#if kind}<span class="kind">{kind}</span>{/if}
      <label class="override">
        Kind
        <select bind:value={kindOverride} aria-label="Kind override">
          <option value="">Auto</option>
          {#each KINDS as k (k)}<option value={k}>{k}</option>{/each}
        </select>
      </label>
    </div>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions">
    <Button onclick={onClose}>Cancel</Button>
    <Button variant="primary" disabled={!parsed || busy} onclick={install}>Install</Button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .35);
    z-index: 40;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 41;
    width: min(92vw, 440px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 650;
  }
  .hint {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .url {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px;
  }
  .url:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .preview {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .preview .name {
    font-weight: 600;
    font-size: 13px;
  }
  .preview .kind {
    font-size: 10.5px;
    letter-spacing: .04em;
    text-transform: uppercase;
    color: var(--faint);
    background: var(--surface-2);
    padding: 2px 7px;
    border-radius: 20px;
  }
  .override {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--muted);
    margin-left: auto;
  }
  .override select {
    font-family: var(--ui);
    font-size: 12px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 4px 8px;
  }
  .error {
    margin: 0;
    color: var(--crit);
    font-size: 12.5px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
