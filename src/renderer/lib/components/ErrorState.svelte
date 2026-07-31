<script lang="ts">
  import Button from "./Button.svelte";
  let { message, onRetry }: { message: string; onRetry?: () => void } = $props();
</script>

<div class="error" role="alert">
  <span class="msg">{message}</span>
  {#if onRetry}<Button onclick={onRetry}>Retry</Button>{/if}
</div>

<style>
  .error { display: flex; align-items: center; gap: 12px; color: var(--crit); font-size: 13px; padding: 8px 0; }
  .msg { flex: 0 1 auto; }
</style>
