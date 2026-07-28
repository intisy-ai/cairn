<script lang="ts">
  import BarChart from "./BarChart.svelte";

  export let items = [
    { label: "sonnet", value: 40, meta: "anthropic" },
    { label: "opus", value: 20, meta: "anthropic" },
  ];
  export let selected: string | null = null;
  export let clicked: string[] = [];
</script>

<BarChart {items} {selected} onselect={(label) => clicked.push(label)} />
