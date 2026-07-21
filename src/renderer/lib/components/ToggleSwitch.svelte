<script lang="ts">
  let {
    checked = $bindable(false),
    label,
    onchange,
  }: {
    checked?: boolean;
    label: string;
    onchange?: (checked: boolean) => void;
  } = $props();

  function toggle(): void {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button class="sw" role="switch" aria-checked={checked} aria-label={label} onclick={toggle}></button>

<style>
  .sw {
    width: 38px;
    height: 22px;
    border-radius: 12px;
    background: var(--border-strong);
    border: none;
    cursor: pointer;
    position: relative;
    padding: 0;
    transition: background .18s ease;
  }
  .sw::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .3);
    transition: transform .18s ease;
  }
  .sw[aria-checked="true"] {
    background: var(--accent);
  }
  .sw[aria-checked="true"]::after {
    transform: translateX(16px);
  }
  .sw:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
