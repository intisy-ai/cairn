<script lang="ts">
  import { onMount } from "svelte";
  import { router, navigate, SCREENS } from "../router.js";
  import { serverStatus, watchServerStatus } from "../serverStatus.js";
  import CairnMark from "./CairnMark.svelte";

  let {
    brandName = "Cairn",
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
    <CairnMark size={28} />
    <div class="bname"><b>{brandName}</b><small>{brandTag}</small></div>
  </div>
  <nav class="nav">
    {#each mainScreens as screen (screen.id)}
      <button type="button" class={$router.screen === screen.id ? "active" : ""} title={screen.label} onclick={go(screen.id)}>
        <span class="ic">{screen.glyph}</span> <span class="lbl">{screen.label}</span>
      </button>
    {/each}
  </nav>
  <div class="navsec"><p class="label">Network</p></div>
  <nav class="nav">
    {#each networkScreens as screen (screen.id)}
      <button type="button" class={$router.screen === screen.id ? "active" : ""} title={screen.label} onclick={go(screen.id)}>
        <span class="ic">{screen.glyph}</span> <span class="lbl">{screen.label}</span>
      </button>
    {/each}
  </nav>
  <div class="foot" title="Local API :{port}"><span class="dot" class:off={!running}></span> <span class="foottext">Local API · <span class="num">:{port}</span></span></div>
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

  /* Narrow window: collapse to an icon rail */
  @media (max-width: 900px) {
    .side {
      padding: 16px 8px;
      align-items: stretch;
    }
    .brand {
      justify-content: center;
      padding: 6px 0 14px;
    }
    .brand .bname {
      display: none;
    }
    .nav button {
      justify-content: center;
      padding: 9px 0;
    }
    .nav button .lbl {
      display: none;
    }
    .navsec {
      display: none;
    }
    .side .foot {
      justify-content: center;
    }
    .side .foot .foottext {
      display: none;
    }
  }
</style>
