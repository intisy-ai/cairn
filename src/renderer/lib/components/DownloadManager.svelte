<script lang="ts">
  import { downloads, toggleDownloads, clearFinished } from "../downloads.js";

  const runningCount = $derived($downloads.tasks.filter((task) => task.status === "running").length);
  const hasFinished = $derived($downloads.tasks.some((task) => task.status === "done" || task.status === "failed"));
</script>

<div class="downloadmgr">
  <button class="iconbtn" title="Downloads" aria-label="Toggle download manager" onclick={toggleDownloads}>
    ⇩
    {#if runningCount > 0}<span class="badge">{runningCount}</span>{/if}
  </button>
  {#if $downloads.open}
    <div class="panel">
      <div class="panelhead">
        <span class="title">Downloads</span>
        {#if hasFinished}
          <button class="clearbtn" onclick={clearFinished}>Clear</button>
        {/if}
      </div>
      {#if $downloads.tasks.length === 0}
        <p class="empty">No downloads yet</p>
      {:else}
        {#each $downloads.tasks as task (task.id)}
          <div class="task">
            <div class="row">
              <span class="label">{task.label}</span>
              <span class="status status-{task.status}">{task.status}</span>
            </div>
            <div class="home">{task.home}</div>
            {#if task.status === "failed"}<div class="error">{task.error}</div>{/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .downloadmgr {
    position: relative;
    -webkit-app-region: no-drag;
  }
  .iconbtn {
    position: relative;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 14px;
    -webkit-app-region: no-drag;
  }
  .iconbtn:hover {
    background: var(--surface);
    border-color: var(--border);
    color: var(--text);
  }
  .iconbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }
  .badge {
    position: absolute;
    top: 1px;
    right: 1px;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--surface);
    font-size: 9.5px;
    font-weight: 700;
    line-height: 14px;
    text-align: center;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 280px;
    max-height: 320px;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    z-index: 50;
    padding: 6px;
    -webkit-app-region: no-drag;
  }
  .panelhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 6px 6px;
  }
  .panelhead .title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: .02em;
    color: var(--faint);
    text-transform: uppercase;
  }
  .clearbtn {
    all: unset;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    color: var(--muted);
  }
  .clearbtn:hover {
    color: var(--text);
  }
  .clearbtn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .empty {
    padding: 10px;
    color: var(--faint);
    font-size: 12px;
    text-align: center;
  }
  .task {
    padding: 8px;
    border-radius: 7px;
  }
  .task:hover {
    background: var(--surface-2);
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .label {
    font-size: 12.5px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status {
    flex: none;
    font-size: 10.5px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: .02em;
  }
  .status-failed {
    color: var(--crit);
  }
  .status-done {
    color: var(--good);
  }
  .home {
    font-size: 11px;
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .error {
    margin-top: 4px;
    font-size: 11px;
    color: var(--crit);
  }
</style>
