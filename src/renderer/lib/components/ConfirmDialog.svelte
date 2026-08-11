<script lang="ts">
  import Button from "./Button.svelte";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  // An optional opt-in that travels with the confirmation, for a destructive step the caller
  // wants offered but never assumed. It is off every time the dialog opens, on purpose: a
  // checkbox that remembered a dangerous choice would eventually take an action nobody meant.
  let {
    title,
    message,
    confirmLabel = "Confirm",
    danger = false,
    optIn = "",
    optInNote = "",
    onConfirm,
    onCancel,
  }: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    optIn?: string;
    optInNote?: string;
    onConfirm: (optedIn: boolean) => void;
    onCancel: () => void;
  } = $props();

  let optedIn = $state(false);

  let confirmBtn = $state<HTMLButtonElement | undefined>(undefined);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onCancel();
  }

  $effect(() => {
    confirmBtn?.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={onCancel} transition:fadeMotion></div>
<div class="dialog" role="dialog" aria-modal="true" aria-label={title} transition:flyMotion={{ y: 8 }}>
  <h3>{title}</h3>
  <p class="msg">{message}</p>
  {#if optIn}
    <label class="optin">
      <input type="checkbox" bind:checked={optedIn} />
      <span>
        {optIn}
        {#if optInNote}<span class="note">{optInNote}</span>{/if}
      </span>
    </label>
  {/if}
  <div class="actions">
    <Button onclick={onCancel}>Cancel</Button>
    <button
      bind:this={confirmBtn}
      class="btn"
      class:primary={!danger}
      class:danger
      onclick={() => onConfirm(optedIn)}
    >
      {confirmLabel}
    </button>
  </div>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 40; }
  .dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 41; width: min(94vw, 420px); max-height: 88vh; overflow-y: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .msg { margin: 0; font-size: 13px; color: var(--muted); }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .optin { display: flex; align-items: flex-start; gap: var(--space-sm); font-size: var(--fs-sm); cursor: pointer; }
  .optin input { margin: 0; accent-color: var(--crit); }
  .note { display: block; margin-top: var(--space-3xs); color: var(--muted); font-size: var(--fs-xs); }
  .btn {
    font-family: var(--ui);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 8px;
    padding: 8px 13px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    display: inline-flex;
    align-items: center;
    gap: 7px;
    white-space: nowrap;
  }
  .btn:hover {
    border-color: var(--faint);
  }
  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .btn.primary:hover {
    filter: brightness(1.05);
  }
  .btn.danger {
    background: var(--crit-weak);
    border-color: var(--crit);
    color: var(--crit);
  }
  .btn.danger:hover {
    background: var(--crit);
    color: #fff;
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
