<script lang="ts">
  const WARN_THRESHOLD = 0.8;

  let { label = "", remainingFraction }: { label?: string; remainingFraction: number } = $props();

  const usedFraction = $derived(Math.max(0, Math.min(1, 1 - remainingFraction)));
  const percent = $derived(Math.round(usedFraction * 100));
  const color = $derived(usedFraction >= WARN_THRESHOLD ? "var(--warn)" : "var(--good)");
</script>

<div class="quota">
  <div class="bar"><i style={`width:${percent}%;background:${color}`}></i></div>
  <div class="q">
    {#if label}<span>{label}</span>{/if}
    <span class="num">{percent}%</span>
  </div>
</div>

<style>
  .quota {
    min-width: 0;
  }
  .bar {
    height: 6px;
    border-radius: 4px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .bar i {
    display: block;
    height: 100%;
    border-radius: 4px;
  }
  .quota .q {
    font-size: 11px;
    color: var(--muted);
    margin-top: 5px;
    display: flex;
    justify-content: space-between;
  }
</style>
