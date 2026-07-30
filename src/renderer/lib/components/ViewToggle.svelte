<script lang="ts">
  import type { ViewMode } from "../viewMode.js";
  let { value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void } = $props();
</script>

<div class="toggle" role="group" aria-label="View mode">
  <button type="button" class="btn" class:on={value === "list"} aria-label="List view" aria-pressed={value === "list"} onclick={() => onChange("list")}>☰</button>
  <button type="button" class="btn" class:on={value === "grid"} aria-label="Grid view" aria-pressed={value === "grid"} onclick={() => onChange("grid")}>▦</button>
</div>

<style>
  .toggle { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 8px; overflow: hidden; }
  .btn { font-size: 13px; padding: 6px 10px; background: var(--surface); color: var(--faint); border: none; cursor: pointer; }
  .btn + .btn { border-left: 1px solid var(--border); }
  .btn.on { background: var(--surface-2); color: var(--text); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
