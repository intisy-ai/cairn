<script lang="ts">
  import CustomEndpointsDialog from "./CustomEndpointsDialog.svelte";
  export let closed = 0;
</script>
<CustomEndpointsDialog onClose={() => (closed += 1)} />
