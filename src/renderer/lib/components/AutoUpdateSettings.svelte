<script lang="ts">
  import type { PluginConfigSchema } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import ToggleSwitch from "./ToggleSwitch.svelte";

  // The schema is handed in by whoever already resolved this home's plugin settings, so
  // showing these controls costs no extra probing of the home's bundles.
  let { homeId, schema }: { homeId: string; schema: PluginConfigSchema | null } = $props();

  type Triggers = { loader: boolean; app: boolean; cairn: boolean };

  const MODES = ["off", "check", "update"];
  const TRIGGER_LABELS: { key: keyof Triggers; label: string }[] = [
    { key: "loader", label: "when the launcher menu opens" },
    { key: "app", label: "when this app starts" },
    { key: "cairn", label: "when the dashboard starts" },
  ];

  let modeOverride = $state<string | null>(null);
  let triggersOverride = $state<Triggers | null>(null);
  let loadError = $state("");

  const values = $derived({ ...(schema?.defaults ?? {}), ...(schema?.current ?? {}) } as Record<string, unknown>);

  const storedMode = $derived.by(() => {
    if (typeof values.auto_update_mode === "string" && MODES.includes(values.auto_update_mode)) return values.auto_update_mode;
    if (values.update_on_launch === false) return "check";
    return "update";
  });
  const storedTriggers = $derived.by((): Triggers => {
    const stored = values.auto_update_triggers;
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return { loader: true, app: true, cairn: true };
    const t = stored as Record<string, unknown>;
    return { loader: t.loader !== false, app: t.app !== false, cairn: t.cairn !== false };
  });

  // A local override shows the change instantly; the stored value governs until then.
  const mode = $derived(modeOverride ?? storedMode);
  const triggers = $derived(triggersOverride ?? storedTriggers);

  async function write(key: string, value: unknown): Promise<void> {
    try {
      const result = await cairn.configWrite(homeId, "plugin-updater", key, value);
      if (!result.ok) loadError = result.error;
    } catch (e) {
      loadError = (e as { message?: string }).message ?? String(e);
    }
  }

  async function setMode(next: string): Promise<void> {
    modeOverride = next;
    await write("auto_update_mode", next);
  }

  // The triggers are one config key, so a single toggle writes the whole object.
  async function setTrigger(key: keyof Triggers, on: boolean): Promise<void> {
    const next = { ...triggers, [key]: on };
    triggersOverride = next;
    await write("auto_update_triggers", next);
  }
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
