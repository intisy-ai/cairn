<script lang="ts">
  import { theme, setTheme } from "../theme.js";
  import { intisy } from "../ipc.js";

  let { title = "intisy", subtitle = "" }: { title?: string; subtitle?: string } = $props();

  function toggleTheme(): void {
    setTheme($theme === "dark" ? "light" : "dark");
  }
</script>

<div class="titlebar">
  <div class="lights">
    <button class="light close" aria-label="Close window" onclick={() => intisy.close()}></button>
    <button class="light minimize" aria-label="Minimize window" onclick={() => intisy.minimize()}></button>
    <button class="light maximize" aria-label="Maximize window" onclick={() => intisy.maximize()}></button>
  </div>
  <div class="wm">{title}{#if subtitle}<span> · {subtitle}</span>{/if}</div>
  <div class="spacer"></div>
  <button class="iconbtn" title="Toggle theme" aria-label="Toggle light or dark theme" onclick={toggleTheme}>◐</button>
</div>

<style>
  .titlebar {
    height: 40px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 14px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
  }
  .lights {
    display: flex;
    gap: 8px;
  }
  .light {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: block;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .light.close {
    background: #e0655b;
  }
  .light.minimize {
    background: #e3b341;
  }
  .light.maximize {
    background: #57a860;
  }
  .light:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .wm {
    font-weight: 650;
    letter-spacing: -.01em;
    font-size: 13px;
  }
  .wm span {
    color: var(--faint);
    font-weight: 500;
  }
  .spacer {
    flex: 1;
  }
  .iconbtn {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 14px;
  }
  .iconbtn:hover {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
  .iconbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
</style>
