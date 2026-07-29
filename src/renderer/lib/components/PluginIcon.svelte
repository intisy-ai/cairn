<script lang="ts">
  import type { CatalogKind } from "@cairn/shared";
  let { icon = "", name, kind, size = 34 }: { icon?: string; name: string; kind?: CatalogKind; size?: number } = $props();

  // Deterministic hue from the name so each lettermark is stable and distinct.
  function hue(text: string): number {
    let h = 0;
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }
  const letter = $derived((name.replace(/[^A-Za-z0-9]/g, "")[0] ?? "?").toUpperCase());
  const tint = $derived(kind === "provider" ? 265 : kind === "proxy" ? 200 : hue(name));
</script>

{#if icon}
  <img class="icon" src={icon} alt="" width={size} height={size} style="width:{size}px;height:{size}px" />
{:else}
  <span
    class="lettermark"
    aria-hidden="true"
    style="width:{size}px;height:{size}px;font-size:{Math.round(size * 0.42)}px;background:hsl({tint} 45% 42%)"
  >{letter}</span>
{/if}

<style>
  .icon {
    border-radius: 8px;
    object-fit: cover;
    flex-shrink: 0;
    background: var(--surface-2);
  }
  .lettermark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: #fff;
    font-weight: 600;
    flex-shrink: 0;
    user-select: none;
  }
</style>
