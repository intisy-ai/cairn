<script lang="ts">
  import AreaChart from "./AreaChart.svelte";
  import { SERIES_COLORS } from "./chartMath.js";

  export let columns: string[] = ["2026-07-01", "2026-07-02"];
  export let series = [
    { key: "input", color: SERIES_COLORS.input, values: [10, 20] },
    { key: "output", color: SERIES_COLORS.output, values: [5, 15] },
  ];
</script>

<AreaChart {columns} {series} />
