<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "Search",
  }: { value?: string; placeholder?: string } = $props();
</script>

<div class="search">
  <span class="mag">⌕</span>
  <input {placeholder} aria-label={placeholder} bind:value />
</div>

<style>
  .search {
    flex: 1;
    min-width: 180px;
    position: relative;
  }
  .search input {
    width: 100%;
    font-family: var(--ui);
    font-size: 13px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 9px 12px 9px 32px;
  }
  .search input::placeholder {
    color: var(--faint);
  }
  .search input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-weak);
  }
  .search .mag {
    position: absolute;
    left: 11px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--faint);
    font-size: 13px;
  }
</style>
