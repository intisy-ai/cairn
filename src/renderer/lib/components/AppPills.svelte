<script lang="ts">
  let {
    cc,
    oc,
    onToggleCc,
    onToggleOc,
  }: {
    cc: boolean;
    oc: boolean;
    onToggleCc?: (on: boolean) => void;
    onToggleOc?: (on: boolean) => void;
  } = $props();
</script>

<div class="apps">
  {#if onToggleCc}
    <button type="button" class="app" class:on={cc} class:na={!cc} onclick={() => onToggleCc(!cc)}>CC</button>
  {:else}
    <span class="app" class:on={cc} class:na={!cc}>CC</span>
  {/if}
  {#if onToggleOc}
    <button type="button" class="app" class:on={oc} class:na={!oc} onclick={() => onToggleOc(!oc)}>OC</button>
  {:else}
    <span class="app" class:on={oc} class:na={!oc}>OC</span>
  {/if}
</div>

<style>
  .apps {
    display: flex;
    gap: 5px;
  }
  .app {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .02em;
    padding: 2px 6px;
    border-radius: 5px;
    border: 1px solid var(--border);
    color: var(--muted);
    background: transparent;
    cursor: default;
  }
  button.app {
    cursor: pointer;
  }
  .app.on {
    color: var(--text);
    border-color: var(--border-strong);
    background: var(--surface-2);
  }
  .app.na {
    color: var(--faint);
    opacity: .55;
  }
</style>
