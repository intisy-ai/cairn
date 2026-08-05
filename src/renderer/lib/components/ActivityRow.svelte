<script lang="ts">
  import type { ActivityRecord, Impact } from "@cairn/shared";
  import { humanizeId } from "../util/appLabel.js";

  let {
    record,
    expanded = false,
    follower = false,
    followerCount = 0,
    ontoggle,
  }: {
    record: ActivityRecord;
    expanded?: boolean;
    follower?: boolean;
    followerCount?: number;
    ontoggle: () => void;
  } = $props();

  function impactVariant(impact: Impact): string {
    if (impact === "error") return "crit";
    if (impact === "warning") return "warn";
    if (impact === "notice") return "accent";
    if (impact === "info") return "muted";
    return "faint";
  }

  function impactGlyph(impact: Impact): string {
    if (impact === "error") return "!";
    if (impact === "warning") return "*";
    if (impact === "notice") return "+";
    if (impact === "info") return "-";
    return ".";
  }

  function relativeTime(ts: number): string {
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 60) return "just now";
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.round(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    return `${Math.round(diffHour / 24)}d ago`;
  }

  function duration(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  }

  // A target that names neither an app nor a different home says nothing new. A home
  // with no app id shows its directory name, which reads better than a full path and
  // still names nothing specific.
  const targetLabel = $derived.by(() => {
    const target = record.target;
    if (!target) return "";
    if (target.app) return humanizeId(target.app);
    if (target.home && target.home !== record.origin?.home) return target.home.split(/[\\/]/).filter(Boolean).pop() ?? "";
    return "";
  });

  const causeParts = $derived.by(() => {
    const parts: string[] = [];
    if (record.cause?.kind) parts.push(record.cause.kind);
    if (record.cause?.surface) parts.push(record.cause.surface);
    if (record.outcome) parts.push(record.outcome);
    if (typeof record.durationMs === "number") parts.push(duration(record.durationMs));
    return parts;
  });

  function display(value: unknown): string {
    if (value === undefined) return "(unset)";
    if (value === null) return "null";
    return typeof value === "string" ? value : JSON.stringify(value);
  }
</script>

<div class="wrap" class:follower>
  <button type="button" class="row" onclick={ontoggle} aria-expanded={expanded}>
    <span class="impact impact-{impactVariant(record.impact)}" title={record.impact}>{impactGlyph(record.impact)}</span>
    <span class="text" title={record.text}>{record.text}</span>
    {#if followerCount > 0}
      <span class="count" data-testid="activity-followers">+{followerCount}</span>
    {/if}
    {#if record.origin?.app}
      <span class="badge">{humanizeId(record.origin.app)}</span>
    {/if}
    {#if targetLabel}
      <span class="badge badge-target" data-testid="activity-target">{targetLabel}</span>
    {/if}
    <span class="time">{relativeTime(record.ts)}</span>
  </button>

  {#if causeParts.length > 0}
    <p class="cause" data-testid="activity-cause">{causeParts.join(" / ")}</p>
  {/if}

  {#if expanded}
    {#if record.changes && record.changes.length > 0}
      <table class="changes" data-testid="activity-changes">
        <tbody>
          {#each record.changes as change (change.key)}
            <tr>
              <td class="key">{change.key}</td>
              {#if change.redacted}
                <td class="redacted" colspan="2">redacted</td>
              {:else}
                <td class="from">{display(change.from)}</td>
                <td class="to">{display(change.to)}</td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <pre class="details" data-testid="activity-details">{JSON.stringify(record.details, null, 2)}</pre>
  {/if}
</div>

<style>
  .wrap {
    border-bottom: 1px solid var(--border);
  }
  .follower {
    padding-left: 22px;
    background: var(--bg-subtle, transparent);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 12px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .impact {
    width: 14px;
    text-align: center;
    font-weight: 700;
  }
  .impact-crit { color: var(--crit); }
  .impact-warn { color: var(--warn); }
  .impact-accent { color: var(--accent); }
  .impact-muted { color: var(--muted); }
  .impact-faint { color: var(--border-strong); }
  .text {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
  .badge {
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1px 6px;
    white-space: nowrap;
  }
  .badge-target::before {
    content: "to ";
    color: var(--border-strong);
  }
  .count {
    font-size: 11px;
    color: var(--accent);
  }
  .time {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
  }
  .cause {
    margin: 0 12px 7px 36px;
    font-size: 11px;
    color: var(--muted);
  }
  .changes {
    margin: 0 12px 8px 36px;
    border-collapse: collapse;
    font-size: 11.5px;
  }
  .changes td {
    padding: 2px 8px 2px 0;
    vertical-align: top;
  }
  .key { color: var(--muted); }
  .from { text-decoration: line-through; opacity: .75; }
  .redacted { color: var(--warn); font-style: italic; }
  .details {
    margin: 0 12px 10px 36px;
    font-size: 11px;
    color: var(--muted);
    overflow-x: auto;
  }
</style>
