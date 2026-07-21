<script lang="ts">
  let { label }: { label: string } = $props();
</script>

<div class="head">
  <h1>{label}</h1>
  <p>This screen is coming soon.</p>
</div>

<style>
  .head h1 {
    margin: 0;
    font-size: 18px;
    letter-spacing: -.01em;
  }
  .head p {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
