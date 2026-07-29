<script lang="ts">
  import ImportDialog from "./ImportDialog.svelte";

  export let app: string = "claude";
  export let notes: string[] = [];
</script>

<ImportDialog {app} label="Claude Code" onClose={() => {}} onDone={(n) => (notes = n)} />
