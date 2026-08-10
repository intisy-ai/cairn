<script lang="ts">
  import type { Snippet } from "svelte";
  import { fadeMotion, flyMotion } from "../util/motion.js";

  // One shape for every popup in the app: a titled header, a scrolling body, and a single
  // right-aligned footer row. Dialogs that grew their own action rows ended up with buttons
  // stacked in two places; a dialog states its actions once, here, and they line up.
  let {
    title,
    subtitle = "",
    width = "md",
    testid = "",
    onClose,
    body,
    actions,
  }: {
    title: string;
    subtitle?: string;
    width?: "sm" | "md" | "lg";
    testid?: string;
    onClose: () => void;
    body: Snippet;
    actions?: Snippet;
  } = $props();

  let panel = $state<HTMLDivElement | undefined>(undefined);

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }

  $effect(() => {
    panel?.focus();
  });
</script>

<svelte:window onkeydown={onKeydown} />
<div class="backdrop" role="presentation" onclick={onClose} transition:fadeMotion></div>
<div
  class="dialog {width}"
  role="dialog"
  aria-modal="true"
  aria-label={title}
  tabindex="-1"
  bind:this={panel}
  data-testid={testid || undefined}
  transition:flyMotion={{ y: 8 }}
>
  <header>
    <h3>{title}</h3>
    {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
  </header>

  <div class="body">{@render body()}</div>

  {#if actions}<footer>{@render actions()}</footer>{/if}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 40;
  }
  .dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 41;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    background: var(--surface);
    border: var(--hairline) solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
  }
  .dialog:focus {
    outline: none;
  }
  .sm { width: min(94vw, 26rem); }
  .md { width: min(94vw, 35rem); }
  .lg { width: min(94vw, 44rem); }
  header {
    padding: var(--space-2xl) var(--space-2xl) 0;
  }
  h3 {
    margin: 0;
    font-size: var(--fs-md);
    font-weight: 650;
  }
  .subtitle {
    margin: var(--space-2xs) 0 0;
    color: var(--muted);
    font-size: var(--fs-sm);
  }
  /* The body is the only part that scrolls, so the title and the actions stay put on a long
     dialog instead of the footer sliding off the bottom. */
  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-lg) var(--space-2xl);
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  footer {
    flex: none;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-lg) var(--space-2xl) var(--space-2xl);
    border-top: var(--hairline) solid var(--border);
  }
</style>
