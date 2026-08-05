<script lang="ts">
  import { onMount } from "svelte";
  import { cairn } from "../ipc.js";
  import ToggleSwitch from "./ToggleSwitch.svelte";

  let { homeId }: { homeId: string } = $props();

  type Triggers = { loader: boolean; app: boolean; cairn: boolean };

  const MODES = ["off", "check", "update"];
  const TRIGGER_LABELS: { key: keyof Triggers; label: string }[] = [
    { key: "loader", label: "when the launcher menu opens" },
    { key: "app", label: "when this app starts" },
    { key: "cairn", label: "when the dashboard starts" },
  ];

  let mode = $state("update");
  let triggers = $state<Triggers>({ loader: true, app: true, cairn: true });
  let loadError = $state("");

  async function load(): Promise<void> {
    try {
      const result = await cairn.configSchemas(homeId);
      if (!result.ok) {
        loadError = result.error;
        return;
      }
      loadError = "";
      const schema = result.data.find((s) => s.plugin === "plugin-updater");
      const values = { ...(schema?.defaults ?? {}), ...(schema?.current ?? {}) } as Record<string, unknown>;
      if (typeof values.auto_update_mode === "string" && MODES.includes(values.auto_update_mode)) {
        mode = values.auto_update_mode;
      } else if (values.update_on_launch === false) {
        mode = "check";
      }
      const stored = values.auto_update_triggers;
      if (stored && typeof stored === "object" && !Array.isArray(stored)) {
        const t = stored as Record<string, unknown>;
        triggers = { loader: t.loader !== false, app: t.app !== false, cairn: t.cairn !== false };
      }
    } catch (e) {
      loadError = (e as { message?: string }).message ?? String(e);
    }
  }

  async function write(key: string, value: unknown): Promise<void> {
    try {
      const result = await cairn.configWrite(homeId, "plugin-updater", key, value);
      if (!result.ok) loadError = result.error;
    } catch (e) {
      loadError = (e as { message?: string }).message ?? String(e);
    }
  }

  async function setMode(next: string): Promise<void> {
    mode = next;
    await write("auto_update_mode", next);
  }

  // The triggers are one config key, so a single toggle writes the whole object.
  async function setTrigger(key: keyof Triggers, on: boolean): Promise<void> {
    triggers = { ...triggers, [key]: on };
    await write("auto_update_triggers", { ...triggers });
  }

  onMount(() => { void load(); });
</script>

<div class="auto">
  <div class="row">
    <label for={"mode-" + homeId}>Automatic updates</label>
    <select id={"mode-" + homeId} value={mode} onchange={(e) => setMode((e.currentTarget as HTMLSelectElement).value)}>
      {#each MODES as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
    <span class="hint">
      A check always runs on an enabled trigger below, so update badges stay accurate. Only installing is gated:
      off and check never install, update does.
    </span>
  </div>

  <div class="triggers">
    {#each TRIGGER_LABELS as trigger (trigger.key)}
      <div class="row">
        <ToggleSwitch
          label={"Check " + trigger.label}
          checked={triggers[trigger.key]}
          onchange={(on: boolean) => setTrigger(trigger.key, on)}
        />
        <span class="name">Check {trigger.label}</span>
      </div>
    {/each}
  </div>

  {#if loadError}
    <p class="error">Could not read or write this app's update settings: {loadError}</p>
  {/if}
</div>

<style>
  .auto {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 4px 0;
  }
  label,
  .name {
    font-size: 12.5px;
    min-width: 150px;
  }
  .name {
    min-width: 0;
  }
  select {
    font-family: var(--ui);
    font-size: 12px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 8px;
  }
  .hint {
    flex: 1 1 240px;
    color: var(--muted);
    font-size: 11.5px;
  }
  .triggers {
    padding-left: 2px;
  }
  .error {
    margin: 4px 0 0;
    color: var(--crit);
    font-size: 12px;
  }
</style>
