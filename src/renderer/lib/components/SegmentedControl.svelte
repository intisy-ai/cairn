<script lang="ts" generics="T extends string">
  type Option<T> = { value: T; label: string; ariaLabel?: string; title?: string; disabled?: boolean };
  let { options, value, onChange, label }: { options: Option<T>[]; value: T; onChange: (value: T) => void; label: string } = $props();
</script>

<div class="toggle" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class="btn"
      class:on={value === option.value}
      aria-pressed={value === option.value}
      aria-label={option.ariaLabel}
      disabled={option.disabled}
      title={option.title}
      onclick={() => !option.disabled && onChange(option.value)}
    >{option.label}</button>
  {/each}
</div>

<style>
  .toggle { display: inline-flex; border: 1px solid var(--border-strong); border-radius: 8px; overflow: hidden; }
  .btn { font-size: 13px; padding: 6px 10px; background: var(--surface); color: var(--faint); border: none; cursor: pointer; }
  .btn + .btn { border-left: 1px solid var(--border); }
  .btn.on { background: var(--surface-2); color: var(--text); }
  .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
