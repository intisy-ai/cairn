<script lang="ts">
  import Icon from "./Icon.svelte";

  let {
    name,
    title,
    onclick,
    danger = false,
    disabled = false,
  }: {
    name: string;
    title: string;
    onclick: () => void;
    danger?: boolean;
    disabled?: boolean;
  } = $props();
</script>

<button class="iconbtn" class:danger {title} aria-label={title} {onclick} {disabled}>
  <Icon {name} />
</button>

<style>
  .iconbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
    flex: none;
  }
  .iconbtn:hover {
    color: var(--text);
    border-color: var(--faint);
    background: var(--surface-2);
  }
  .iconbtn.danger:hover {
    color: var(--crit);
    border-color: var(--crit);
    background: var(--crit-weak);
  }
  .iconbtn:disabled {
    opacity: .5;
    cursor: default;
  }
  .iconbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
