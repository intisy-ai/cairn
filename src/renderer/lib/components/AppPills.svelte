<script lang="ts">
  let { apps, values, onToggle }: {
    apps: { id: string; label: string }[];
    values: Record<string, boolean>;
    onToggle?: (appId: string, on: boolean) => void;
  } = $props();

  function short(label: string): string {
    return label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }
</script>

<div class="apps">
  {#each apps as app (app.id)}
    {@const on = !!values[app.id]}
    {#if onToggle}
      <button type="button" class="app" class:on class:na={!on} title={app.label} onclick={() => onToggle(app.id, !on)}>{short(app.label)}</button>
    {:else}
      <span class="app" class:on class:na={!on} title={app.label}>{short(app.label)}</span>
    {/if}
  {/each}
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
