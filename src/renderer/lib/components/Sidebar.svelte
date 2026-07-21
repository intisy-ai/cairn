<script lang="ts">
  export type NavItem = { label: string; icon: string; href: string; active?: boolean };

  let {
    brandName = "intisy",
    brandTag = "Claude Code · OpenCode",
    navItems = [] as NavItem[],
    networkItems = [] as NavItem[],
    apiPort = 34567,
  }: {
    brandName?: string;
    brandTag?: string;
    navItems?: NavItem[];
    networkItems?: NavItem[];
    apiPort?: number;
  } = $props();
</script>

<aside class="side">
  <div class="brand">
    <div class="mark">{brandName.charAt(0)}</div>
    <div><b>{brandName}</b><small>{brandTag}</small></div>
  </div>
  <nav class="nav">
    {#each navItems as item (item.label)}
      <a href={item.href} class={item.active ? "active" : ""}><span class="ic">{item.icon}</span> {item.label}</a>
    {/each}
  </nav>
  {#if networkItems.length}
    <div class="navsec"><p class="label">Network</p></div>
    <nav class="nav">
      {#each networkItems as item (item.label)}
        <a href={item.href} class={item.active ? "active" : ""}><span class="ic">{item.icon}</span> {item.label}</a>
      {/each}
    </nav>
  {/if}
  <div class="foot"><span class="dot"></span> Local API · <span class="num">:{apiPort}</span></div>
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
  .nav a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 8px;
    border-radius: 7px;
    color: var(--muted);
    text-decoration: none;
    font-size: 13px;
    font-weight: 500;
  }
  .nav a .ic {
    width: 16px;
    text-align: center;
    opacity: .8;
  }
  .nav a:hover {
    background: var(--surface);
    color: var(--text);
  }
  .nav a.active {
    background: var(--accent-weak);
    color: var(--accent);
    font-weight: 600;
  }
  .nav a.active .ic {
    opacity: 1;
  }
  .nav a:focus-visible {
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
</style>
