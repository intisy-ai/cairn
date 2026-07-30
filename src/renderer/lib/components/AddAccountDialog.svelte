<script lang="ts">
  import { onMount } from "svelte";
  import type { LoginBegin } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import { toast } from "../toast.js";
  import Button from "./Button.svelte";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  let { provider, onClose, onAdded }: {
    provider: { id: string; label: string };
    onClose: () => void;
    onAdded: () => void;
  } = $props();

  let begin = $state<LoginBegin | null>(null);
  let beginError = $state("");
  let code = $state("");
  let completeError = $state("");
  let busy = $state(false);
  let copied = $state(false);
  let panel = $state<HTMLDivElement | undefined>(undefined);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") cancelAndClose();
  }

  async function cancelAndClose(): Promise<void> {
    await cairn.accountsLoginCancel(provider.id);
    onClose();
  }

  async function copyUrl(): Promise<void> {
    if (!begin) return;
    try {
      await navigator.clipboard.writeText(begin.url);
      copied = true;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => (copied = false), 1400);
    } catch {
      // clipboard unavailable; nothing to surface
    }
  }

  async function complete(): Promise<void> {
    if (busy || !code.trim()) return;
    busy = true;
    completeError = "";
    const result = await cairn.accountsLoginComplete(provider.id, code);
    busy = false;
    if (!result.ok) {
      completeError = result.error;
      return;
    }
    if (!result.data.added) {
      completeError = "Could not complete sign-in. Check the code and try again.";
      return;
    }
    toast.success(result.data.label ? `Added account: ${result.data.label}` : "Account added");
    onAdded();
  }

  onMount(async () => {
    const result = await cairn.accountsLoginBegin(provider.id);
    if (result.ok) begin = result.data;
    else beginError = result.error;
    panel?.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={cancelAndClose} transition:fadeMotion></div>
<div
  class="dialog"
  role="dialog"
  aria-modal="true"
  aria-label={"Add " + provider.label + " account"}
  tabindex="-1"
  bind:this={panel}
  transition:flyMotion={{ y: 8 }}
>
  <h3>Add {provider.label} account</h3>
  {#if beginError}
    <p class="error">{beginError}</p>
    <div class="actions"><Button onclick={cancelAndClose}>Close</Button></div>
  {:else if begin}
    {#if begin.instructions}<p class="hint">{begin.instructions}</p>{/if}
    <button class="url" title="Copy sign-in link" onclick={copyUrl}>
      {begin.url}<span class="copy">{copied ? "copied" : "copy"}</span>
    </button>
    <a class="ext" href={begin.url} target="_blank" rel="noreferrer">Open sign-in page</a>
    <label>Code
      <input
        type="password"
        aria-label="Sign-in code"
        placeholder="Paste the code from the sign-in page"
        bind:value={code}
      />
    </label>
    {#if completeError}<p class="error">{completeError}</p>{/if}
    <div class="actions">
      <Button onclick={cancelAndClose}>Cancel</Button>
      <Button variant="primary" disabled={busy || !code.trim()} onclick={complete}>Complete sign-in</Button>
    </div>
  {:else}
    <p class="hint">Starting sign-in...</p>
  {/if}
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
    width: min(94vw, 480px);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dialog:focus {
    outline: none;
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
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11.5px;
    color: var(--muted);
  }
  input {
    font-family: var(--ui);
    font-size: 12.5px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 10px;
  }
  input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .url {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
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
  .ext {
    align-self: flex-start;
    font-size: 12px;
    color: var(--accent);
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
