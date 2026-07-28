<script lang="ts">
  let {
    label,
    count,
    open = $bindable(true),
    body,
  }: { label: string; count?: number; open?: boolean; body: import("svelte").Snippet } = $props();
</script>

<section class="grp">
  <button class="hd" aria-label={label} aria-expanded={open} onclick={() => (open = !open)}>
    <span class="chev" class:o={open}>&rsaquo;</span>
    <span class="lbl">{label}</span>
    {#if count !== undefined}<span class="cnt">{count}</span>{/if}
    <span class="line"></span>
  </button>
  {#if open}
    <div class="bd">{@render body()}</div>
  {/if}
</section>

<style>
  .grp {
    margin-bottom: 26px;
  }

  .hd {
    all: unset;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 2px 10px;
    padding: 0;
  }

  .hd:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .chev {
    font-size: 16px;
    color: var(--faint);
    transform: rotate(0deg);
    transition: transform 150ms ease-out;
    flex-shrink: 0;
  }

  .chev.o {
    transform: rotate(90deg);
  }

  .lbl {
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
    margin: 0;
  }

  .cnt {
    font-size: 11px;
    color: var(--faint);
    font-family: var(--mono);
  }

  .line {
    flex: 1;
    height: 1px;
    background: var(--border);
  }

  .bd {
    margin-bottom: 10px;
  }
</style>
