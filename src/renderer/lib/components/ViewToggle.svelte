<script lang="ts">
  import type { ViewMode } from "../viewMode.js";
  import SegmentedControl from "./SegmentedControl.svelte";
  let { value, onChange }: { value: ViewMode; onChange: (mode: ViewMode) => void } = $props();
  const options: { value: ViewMode; label: string; ariaLabel: string }[] = [
    { value: "list", label: "☰", ariaLabel: "List view" },
    { value: "grid", label: "▦", ariaLabel: "Grid view" },
  ];
</script>

<SegmentedControl {options} {value} {onChange} label="View mode" />
