<script lang="ts">
  import { toasts, toast } from "../toast.js";
  import { flyMotion } from "../util/motion.js";
</script>

<div class="host" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}" role={t.kind === "error" ? "alert" : "status"} in:flyMotion={{ y: 8 }}>
      <span class="msg">{t.message}</span>
      <button class="close" aria-label="Dismiss notification" onclick={() => toast.dismiss(t.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .host { position: fixed; bottom: 16px; right: 16px; z-index: 60; display: flex; flex-direction: column; gap: 8px; max-width: min(92vw, 380px); }
  .toast { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); box-shadow: var(--shadow); font-size: 12.5px; color: var(--text); }
  .toast.success { border-left: 3px solid var(--good); }
  .toast.error { border-left: 3px solid var(--crit); }
  .msg { flex: 1; }
  .close { background: none; border: none; color: var(--faint); font-size: 16px; line-height: 1; cursor: pointer; }
  .close:hover { color: var(--text); }
</style>
