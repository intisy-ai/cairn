<script lang="ts">
  import Donut from "./Donut.svelte";

  export let slices = [
    { label: "anthropic", value: 75, color: "#4b53b8" },
    { label: "google", value: 25, color: "#2f8f5b" },
  ];
  export let clicked: string[] = [];
</script>

<Donut {slices} onselect={(label) => clicked.push(label)} />
