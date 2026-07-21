<script lang="ts">
  let { cc, oc }: { cc: boolean; oc: boolean } = $props();
</script>

<div class="apps">
  <span class="app" class:on={cc} class:na={!cc}>CC</span>
  <span class="app" class:on={oc} class:na={!oc}>OC</span>
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
