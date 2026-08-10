<script lang="ts">
  export type StatusVariant = "good" | "warn" | "off";

  let { variant, label, title = "" }: { variant: StatusVariant; label: string; title?: string } = $props();
</script>

<span class="stpill st-{variant}" title={title || undefined}><span class="d"></span>{label}</span>

<style>
  .stpill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    font-weight: 600;
    padding: 3px 9px;
    border-radius: 20px;
  }
  .stpill .d {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .st-good {
    color: var(--good);
    background: var(--good-weak);
  }
  .st-good .d {
    background: var(--good);
  }
  .st-warn {
    color: var(--warn);
    background: var(--warn-weak);
  }
  .st-warn .d {
    background: var(--warn);
  }
  .st-off {
    color: var(--faint);
    background: var(--surface-2);
  }
  .st-off .d {
    background: var(--faint);
  }
</style>
