<script lang="ts">
  import { downloads, toggleDownloads, clearFinished, type DownloadTask } from "../downloads.js";

  const inFlight = $derived($downloads.tasks.filter((t) => t.status === "pending" || t.status === "installing").length);
  const hasFinished = $derived($downloads.tasks.some((t) => t.status === "done" || t.status === "failed"));

  function sourceLabel(task: DownloadTask): string {
    return task.source === "cairn" ? "Cairn direct" : task.source === "plugin-updater" ? "plugin-updater" : "";
  }
  function progressLine(task: DownloadTask): string {
    if (task.status === "pending") return "Queued";
    if (task.status === "installing") return task.step || "Installing…";
    if (task.status === "done") return "Done";
    return task.error || "Failed";
  }
</script>

<div class="downloadmgr">
  {#if $downloads.tasks.length > 0}
    <button class="iconbtn" title="Downloads" aria-label="Toggle download manager" onclick={toggleDownloads}>
      <svg class="downloadicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      {#if inFlight > 0}<span class="badge">{inFlight}</span>{/if}
    </button>
  {/if}
  {#if $downloads.open && $downloads.tasks.length > 0}
    <div class="panel">
      <div class="panelhead">
        <span class="title">Downloads</span>
        {#if hasFinished}
          <button class="clearbtn" onclick={clearFinished}>Clear</button>
        {/if}
      </div>
      {#each $downloads.tasks as task (task.id)}
        <div class="task status-{task.status}">
          <div class="row">
            <span class="label">{task.label}</span>
            <span class="statedot" aria-hidden="true"></span>
          </div>
          <div class="meta">
            <span class="home">{task.home}</span>
            {#if sourceLabel(task)}
              <span class="src src-{task.source}">{sourceLabel(task)}</span>
            {/if}
          </div>
          {#if task.status === "installing"}
            <div class="bar"><span class="fill"></span></div>
          {/if}
          <div class="progress">{progressLine(task)}</div>
        </div>
      {/each}
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
    padding: 0;
    -webkit-app-region: no-drag;
  }
  .downloadicon {
    width: 14px;
    height: 14px;
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
    width: 300px;
    max-height: 360px;
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
  .statedot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--muted);
  }
  .status-pending .statedot {
    background: var(--faint);
  }
  .status-installing .statedot {
    background: var(--accent);
  }
  .status-done .statedot {
    background: var(--good);
  }
  .status-failed .statedot {
    background: var(--crit);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .home {
    font-size: 11px;
    color: var(--faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1 1 auto;
    min-width: 0;
  }
  .src {
    flex: none;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: .02em;
    text-transform: uppercase;
    padding: 1px 5px;
    border-radius: 5px;
    border: 1px solid var(--border);
    color: var(--muted);
  }
  .src-cairn {
    color: var(--accent);
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
  .bar {
    margin-top: 6px;
    height: 3px;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    display: block;
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: var(--accent);
    animation: slide 1.1s ease-in-out infinite;
  }
  @keyframes slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(320%); }
  }
  .progress {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
  }
  .status-failed .progress {
    color: var(--crit);
  }
  .status-done .progress {
    color: var(--good);
  }
</style>
