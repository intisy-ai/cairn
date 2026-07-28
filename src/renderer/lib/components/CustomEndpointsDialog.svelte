<script lang="ts">
  import { onMount } from "svelte";
  import type { CustomEndpointView } from "@cairn/shared";
  import { SUPPORTED_ENDPOINT_FORMATS } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { track } from "../downloads.js";
  import Button from "./Button.svelte";

  let { onClose }: { onClose: () => void } = $props();

  let installed = $state(true);
  let endpoints = $state<CustomEndpointView[]>([]);
  let error = $state("");
  let busy = $state(false);
  let dirtyHint = $state(false);

  let form = $state({ id: "", label: "", baseUrl: "", format: SUPPORTED_ENDPOINT_FORMATS[0] as string, models: "" });
  let keyDraft = $state<Record<string, string>>({});

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }

  async function refresh(): Promise<void> {
    const providers = await cairn.providersList();
    installed = providers.ok && providers.data.some((p) => p.id === "custom");
    if (!installed) { endpoints = []; return; }
    const list = await cairn.customEndpointsList();
    if (list.ok) endpoints = list.data;
    else error = list.error;
  }

  async function install(): Promise<void> {
    if (busy) return;
    busy = true;
    error = "";
    const result = await track("Install custom-auth", "cairn", () => cairn.pluginsInstall("cairn", "custom-auth", "intisy-ai/custom-auth"));
    busy = false;
    if (result.ok) await refresh();
    else error = result.error;
  }

  async function addEndpoint(): Promise<void> {
    if (busy) return;
    busy = true;
    error = "";
    const endpoint = {
      id: form.id.trim(),
      label: form.label.trim(),
      baseUrl: form.baseUrl.trim(),
      format: form.format,
      models: form.models.split(",").map((m) => m.trim()).filter(Boolean),
    };
    const result = await cairn.customEndpointsUpsert(endpoint);
    busy = false;
    if (result.ok) {
      form = { id: "", label: "", baseUrl: "", format: SUPPORTED_ENDPOINT_FORMATS[0] as string, models: "" };
      dirtyHint = true;
      await refresh();
    } else {
      error = result.error;
    }
  }

  async function removeEndpoint(id: string): Promise<void> {
    const result = await cairn.customEndpointsRemove(id);
    if (result.ok) { dirtyHint = true; await refresh(); }
    else error = result.error;
  }

  async function saveKey(id: string): Promise<void> {
    const key = keyDraft[id];
    if (!key) return;
    const result = await cairn.customEndpointsSaveKey(id, key);
    if (result.ok) { keyDraft = { ...keyDraft, [id]: "" }; await refresh(); }
    else error = result.error;
  }

  onMount(refresh);
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label="Manage custom endpoints">
  <h3>Custom endpoints</h3>
  {#if !installed}
    <p class="hint">The custom-auth provider is not installed. It serves your configured endpoints.</p>
    <div class="actions"><Button variant="primary" disabled={busy} onclick={install}>Install custom-auth</Button></div>
  {:else}
    <div class="list">
      {#each endpoints as ep (ep.id)}
        <div class="ep">
          <div class="ephead">
            <span class="name">{ep.label}</span>
            <span class="fmt">{ep.format}</span>
            <span class="key" class:set={ep.hasKey}>{ep.hasKey ? "key set" : "no key"}</span>
            <button class="rm" onclick={() => removeEndpoint(ep.id)} aria-label={"Remove " + ep.label}>Remove</button>
          </div>
          <div class="epmeta">{ep.id} · {ep.baseUrl} · {ep.models.join(", ")}</div>
          <div class="keyrow">
            <input type="password" placeholder="Set API key" aria-label={"API key for " + ep.label} bind:value={keyDraft[ep.id]} />
            <Button disabled={!keyDraft[ep.id]} onclick={() => saveKey(ep.id)}>Save key</Button>
          </div>
        </div>
      {:else}
        <p class="hint">No endpoints yet. Add one below.</p>
      {/each}
    </div>

    <div class="form">
      <p class="ptitle">Add endpoint</p>
      <label>Endpoint id<input aria-label="Endpoint id" bind:value={form.id} placeholder="myendpoint" /></label>
      <label>Label<input aria-label="Label" bind:value={form.label} placeholder="My endpoint" /></label>
      <label>Base URL<input aria-label="Base URL" bind:value={form.baseUrl} placeholder="https://host/v1" /></label>
      <label>Format
        <select aria-label="Format" bind:value={form.format}>
          {#each SUPPORTED_ENDPOINT_FORMATS as f (f)}<option value={f}>{f}</option>{/each}
        </select>
      </label>
      <label>Models<input aria-label="Models (comma separated)" bind:value={form.models} placeholder="gpt-4o, gpt-4o-mini" /></label>
      <Button variant="primary" disabled={busy} onclick={addEndpoint}>Add endpoint</Button>
    </div>
    {#if dirtyHint}<p class="hint">Restart the Local API to apply new endpoints and models to routing.</p>{/if}
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  <div class="actions"><Button onclick={onClose}>Close</Button></div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; }
  .dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 41; width: min(94vw, 560px); max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .hint { margin: 0; font-size: 12px; color: var(--muted); }
  .ptitle { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); font-weight: 600; margin: 6px 0 2px; }
  .list { display: flex; flex-direction: column; gap: 10px; }
  .ep { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
  .ephead { display: flex; align-items: center; gap: 10px; }
  .ephead .name { font-weight: 600; font-size: 13px; }
  .fmt { font-size: 10.5px; text-transform: uppercase; color: var(--faint); background: var(--surface-2); padding: 2px 7px; border-radius: 20px; }
  .key { font-size: 11px; color: var(--faint); }
  .key.set { color: var(--good); }
  .rm { margin-left: auto; background: none; border: none; color: var(--crit); font-size: 12px; cursor: pointer; }
  .epmeta { font-size: 11.5px; color: var(--faint); font-family: var(--mono); overflow: hidden; text-overflow: ellipsis; }
  .keyrow { display: flex; gap: 8px; }
  .keyrow input { flex: 1; }
  .form { display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border); padding-top: 12px; }
  .form label { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--muted); }
  input, select { font-family: var(--ui); font-size: 12.5px; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
  input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
  .error { margin: 0; color: var(--crit); font-size: 12.5px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
