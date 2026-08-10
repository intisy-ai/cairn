<script lang="ts">
  let {
    label,
    value,
    unit = "",
    meta = "",
    metaColor = "",
  }: {
    label: string;
    value: string;
    unit?: string;
    meta?: string;
    metaColor?: string;
  } = $props();
</script>

<div class="stat">
  <p class="label">{label}</p>
  <div class="v num">{value}{#if unit}<small>{unit}</small>{/if}</div>
  {#if meta}
    <div class="meta" style={metaColor ? `color:${metaColor}` : ""}>
      <span class="dot" style={metaColor ? `background:${metaColor}` : ""}></span> {meta}
    </div>
  {/if}
</div>

<style>
  .stat {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 13px 14px;
    min-width: 0;
  }
  .stat .v {
    font-size: 22px;
    font-weight: 650;
    letter-spacing: -.02em;
    margin-top: 6px;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .stat .v small {
    font-size: 12px;
    color: var(--faint);
    font-weight: 500;
  }
  .stat .meta {
    margin-top: 7px;
    font-size: 11.5px;
    color: var(--muted);
    display: flex;
    align-items: center;
    gap: 6px;
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
