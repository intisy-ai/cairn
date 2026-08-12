<script lang="ts">
  import ScreenRenderer from "../../lib/components/screen/ScreenRenderer.svelte";
  import type { ScreenContext } from "../../lib/components/screen/context.js";
  import { GALLERY_SCREEN, GALLERY_SOURCES } from "../fixtures/screen.js";

  const ctx: ScreenContext = {
    plugin: GALLERY_SCREEN.plugin,
    screenId: GALLERY_SCREEN.id,
    homeId: GALLERY_SCREEN.homes[0],
    sources: GALLERY_SOURCES,
    invoke: async () => {},
    busy: false,
  };
</script>

<div class="screen">
  <ScreenRenderer node={GALLERY_SCREEN.layout} {ctx} />
</div>

<style>
  .screen {
    padding: var(--space-3xl);
    background: var(--canvas);
    border: var(--hairline) solid var(--border);
    border-radius: var(--radius);
  }
</style>
