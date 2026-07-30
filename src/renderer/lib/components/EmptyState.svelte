<script lang="ts">
  import Button from "./Button.svelte";
  let { message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void } = $props();
</script>

<div class="empty">
  <p class="msg">{message}</p>
  {#if actionLabel && onAction}<Button onclick={onAction}>{actionLabel}</Button>{/if}
</div>

<style>
  .empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 16px 18px; }
  .msg { margin: 0; color: var(--faint); font-size: 12.5px; }
</style>
