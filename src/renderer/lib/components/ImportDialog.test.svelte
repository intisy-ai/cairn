<script lang="ts">
  import ImportDialog from "./ImportDialog.svelte";

  export let app: "claude" | "opencode" = "claude";
  export let notes: string[] = [];
</script>

<ImportDialog {app} label="Claude Code" onClose={() => {}} onDone={(n) => (notes = n)} />
