<script lang="ts">
  import type { HostApp } from "@cairn/shared";
  import { appIcon } from "../appIcons.js";

  let { apps, values, onToggle, size = 22 }: {
    apps: HostApp[];
    values: Record<string, boolean>;
    onToggle?: (appId: string, on: boolean) => void;
    size?: number;
  } = $props();

  function letters(label: string): string {
    return label.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase();
  }
</script>

<div class="apps">
  {#each apps as app (app.id)}
    {@const on = !!values[app.id]}
    {@const icon = appIcon(app.id)}
    <svelte:element
      this={onToggle ? "button" : "span"}
      role={onToggle ? "button" : undefined}
      class="app"
      class:on
      class:na={!on}
      title={app.label}
      aria-label={onToggle ? `${app.label}: ${on ? "installed, click to remove" : "click to install"}` : app.label}
      style="width:{size}px;height:{size}px"
      onclick={onToggle ? () => onToggle(app.id, !on) : undefined}
    >
      {#if icon}
        <span class="glyph">{@html icon}</span>
      {:else}
        <span class="lettermark">{letters(app.label)}</span>
      {/if}
    </svelte:element>
  {/each}
</div>

<style>
  .apps {
    display: flex;
    gap: 6px;
  }
  .app {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    border-radius: 6px;
    cursor: default;
    overflow: hidden;
    transition: opacity 0.14s ease, filter 0.14s ease, transform 0.14s ease;
  }
  button.app {
    cursor: pointer;
  }
  button.app:hover {
    transform: translateY(-1px);
  }
  .app .glyph :global(svg),
  .app .lettermark {
    width: 100%;
    height: 100%;
    display: block;
  }
  .glyph {
    display: block;
    width: 100%;
    height: 100%;
  }
  .lettermark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    color: #fff;
    background: var(--faint);
    border-radius: 6px;
  }
  /* Not installed on this app: desaturated + dimmed, but still recognizable. */
  .app.na {
    filter: grayscale(0.85);
    opacity: 0.4;
  }
  .app.on {
    box-shadow: 0 0 0 1.5px var(--accent-border);
  }
</style>
