<script lang="ts">
  import { renderCairnMark, CAIRN_ON_ACCENT } from "@cairn/shared";

  let { size = 24, onAccent = false }: { size?: number; onAccent?: boolean } = $props();

  const markup = $derived(onAccent ? renderCairnMark(size, CAIRN_ON_ACCENT) : renderCairnMark(size));
</script>

<span class="cairn-mark" style="width:{size}px;height:{size}px">{@html markup}</span>

<style>
  .cairn-mark {
    display: inline-flex;
    line-height: 0;
    flex: none;
  }
</style>
