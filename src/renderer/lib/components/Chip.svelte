<script lang="ts">
  let { label, on = false, onclick }: { label: string; on?: boolean; onclick?: () => void } = $props();
</script>

<button type="button" class="chip" class:on onclick={onclick}>{label}</button>

<style>
  .chip {
    font-family: var(--ui);
    font-size: 11.5px;
    color: var(--muted);
    border: 1px solid var(--border);
    background: var(--surface);
    border-radius: 20px;
    padding: 5px 11px;
    cursor: pointer;
    white-space: nowrap;
  }
  .chip.on {
    background: var(--accent-weak);
    border-color: var(--accent-border);
    color: var(--accent);
    font-weight: 600;
  }
  .chip:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
