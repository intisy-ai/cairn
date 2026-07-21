<script lang="ts">
  import { onMount } from "svelte";
  import { router, navigate, SCREENS } from "../router.js";
  import { serverStatus, watchServerStatus } from "../serverStatus.js";

  let {
    brandName = "intisy",
    brandTag = "Claude Code · OpenCode",
    apiPort = 34567,
  }: { brandName?: string; brandTag?: string; apiPort?: number } = $props();

  const mainScreens = SCREENS.filter((screen) => screen.section === "main");
  const networkScreens = SCREENS.filter((screen) => screen.section === "network");

  const running = $derived($serverStatus ? $serverStatus.running : true);
  const port = $derived($serverStatus?.port ?? apiPort);

  onMount(() => watchServerStatus());

  function go(id: (typeof SCREENS)[number]["id"]): (event: MouseEvent) => void {
    return (event: MouseEvent) => {
      event.preventDefault();
      navigate(id);
    };
  }
</script>

<aside class="side">
  <div class="brand">
    <div class="mark">{brandName.charAt(0)}</div>
    <div><b>{brandName}</b><small>{brandTag}</small></div>
  </div>
  <nav class="nav">
    {#each mainScreens as screen (screen.id)}
      <button type="button" class={$router.screen === screen.id ? "active" : ""} onclick={go(screen.id)}>
        <span class="ic">{screen.glyph}</span> {screen.label}
      </button>
    {/each}
  </nav>
  <div class="navsec"><p class="label">Network</p></div>
  <nav class="nav">
    {#each networkScreens as screen (screen.id)}
      <button type="button" class={$router.screen === screen.id ? "active" : ""} onclick={go(screen.id)}>
        <span class="ic">{screen.glyph}</span> {screen.label}
      </button>
    {/each}
  </nav>
  <div class="foot"><span class="dot" class:off={!running}></span> Local API · <span class="num">:{port}</span></div>
</aside>

<style>
  .side {
    background: var(--surface-2);
    border-right: 1px solid var(--border);
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px 14px;
  }
  .brand .mark {
    width: 26px;
    height: 26px;
    border-radius: 7px;
    background: var(--accent);
    color: #fff;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 14px;
  }
  .brand b {
    font-size: 14.5px;
    letter-spacing: -.01em;
  }
  .brand small {
    display: block;
    color: var(--faint);
    font-size: 10.5px;
    letter-spacing: .02em;
    margin-top: 1px;
  }
  .navsec {
    margin: 12px 8px 4px;
  }
  .nav button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--muted);
    font-family: var(--ui);
    text-align: left;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
  }
  .nav button .ic {
    width: 16px;
    text-align: center;
    opacity: .8;
  }
  .nav button:hover {
    background: var(--surface);
    color: var(--text);
  }
  .nav button.active {
    background: var(--accent-weak);
    color: var(--accent);
    font-weight: 600;
  }
  .nav button.active .ic {
    opacity: 1;
  }
  .nav button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }
  .side .foot {
    margin-top: auto;
    padding: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--good);
    box-shadow: 0 0 0 3px var(--good-weak);
    flex: none;
  }
  .dot.off {
    background: var(--faint);
    box-shadow: 0 0 0 3px var(--surface-2);
  }
</style>
