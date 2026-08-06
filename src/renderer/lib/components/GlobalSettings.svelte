<script lang="ts">
  import { formatBytes } from "@cairn/shared";
  import { onMount } from "svelte";
  import type { FieldSpec } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import Card from "./Card.svelte";
  import ToggleSwitch from "./ToggleSwitch.svelte";

  let fields = $state<FieldSpec[]>([]);
  let values = $state<Record<string, unknown>>({});
  let stats = $state<{ bytes: number; segments: number; oldestTs?: number } | null>(null);
  let loadError = $state("");

  const groups = $derived.by(() => {
    const byGroup = new Map<string, FieldSpec[]>();
    for (const field of fields) {
      const name = field.group || "General";
      const list = byGroup.get(name) ?? [];
      list.push(field);
      byGroup.set(name, list);
    }
    return Array.from(byGroup, ([name, items]) => ({ name, items }));
  });

  function labelFor(field: FieldSpec): string {
    return field.label || field.key;
  }

  async function load(): Promise<void> {
    try {
      const result = await cairn.globalSettingsRead();
      if (!result.ok) {
        loadError = result.error;
        return;
      }
      loadError = "";
      fields = result.data.fields;
      values = { ...result.data.defaults, ...result.data.current };
      const storage = await cairn.activityStats();
      if (storage.ok) stats = storage.data;
    } catch (e) {
      loadError = (e as { message?: string }).message ?? String(e);
    }
  }

  async function write(key: string, value: unknown): Promise<void> {
    values = { ...values, [key]: value };
    try {
      await cairn.setConfig("settings", key, value);
    } catch (e) {
      loadError = (e as { message?: string }).message ?? String(e);
    }
  }

  onMount(() => { void load(); });
</script>

<Card>
  <h2>Shared settings</h2>
  <p class="desc">
    Stored in this home's <code>config/settings.json</code> and read by every plugin. A change applies to newly
    started processes; anything already running keeps the value it read.
  </p>

  {#if loadError}
    <p class="error">Could not load settings: {loadError}</p>
  {/if}

  {#each groups as group (group.name)}
    <section>
      <h3>{group.name}</h3>
      {#each group.items as field (field.key)}
        <div class="row">
          {#if field.type === "boolean"}
            <ToggleSwitch
              label={labelFor(field)}
              checked={values[field.key] === true}
              onchange={(on: boolean) => write(field.key, on)}
            />
            <span class="name">{labelFor(field)}</span>
          {:else if field.type === "select"}
            <label for={"gs-" + field.key}>{labelFor(field)}</label>
            <select
              id={"gs-" + field.key}
              value={String(values[field.key] ?? "")}
              onchange={(e) => write(field.key, (e.currentTarget as HTMLSelectElement).value)}
            >
              {#each field.options ?? [] as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else if field.type === "number"}
            <label for={"gs-" + field.key}>{labelFor(field)}</label>
            <input
              id={"gs-" + field.key}
              type="number"
              min={field.min}
              max={field.max}
              step={field.step}
              value={Number(values[field.key] ?? 0)}
              onchange={(e) => write(field.key, Number((e.currentTarget as HTMLInputElement).value))}
            />
          {:else}
            <label for={"gs-" + field.key}>{labelFor(field)}</label>
            <input
              id={"gs-" + field.key}
              type="text"
              value={String(values[field.key] ?? "")}
              onchange={(e) => write(field.key, (e.currentTarget as HTMLInputElement).value)}
            />
          {/if}
          {#if field.description}
            <span class="hint">{field.description}</span>
          {/if}
        </div>
      {/each}
    </section>
  {/each}

  {#if stats}
    <p class="hint stats">
      Activity log: {formatBytes(stats.bytes)} across {stats.segments} segments{stats.oldestTs
        ? `, oldest event ${new Date(stats.oldestTs).toLocaleDateString()}`
        : ""}. Limits apply when the log rotates (about every 1 MB), so a quiet home keeps its history until then.
    </p>
  {/if}
</Card>

<style>
  h2 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 650;
  }
  h3 {
    margin: 14px 0 6px;
    font-size: 12.5px;
    color: var(--muted);
    font-weight: 600;
  }
  .desc,
  .hint {
    color: var(--muted);
    font-size: 12px;
  }
  .stats {
    margin-top: 14px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 5px 0;
  }
  .row label,
  .row .name {
    font-size: 12.5px;
    min-width: 170px;
  }
  .hint {
    flex: 1 1 220px;
  }
  .error {
    color: var(--crit);
    font-size: 12.5px;
  }
</style>
