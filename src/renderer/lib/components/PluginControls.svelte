<script lang="ts">
  import type { PluginConfigSchema, FieldSpec, FieldType, ActionSpec } from "@cairn/shared";
  import { cairn } from "../ipc.js";
  import ToggleSwitch from "./ToggleSwitch.svelte";
  import Button from "./Button.svelte";
  import Spinner from "./Spinner.svelte";

  let { homeId, schema }: { homeId: string; schema: PluginConfigSchema } = $props();

  // Declared fields win; otherwise infer typed fields from the flat defaults/current
  // so plugins that never declared capabilities render exactly as before.
  function inferredFields(): FieldSpec[] {
    const keys = [...new Set([...Object.keys(schema.defaults), ...Object.keys(schema.current)])].sort();
    return keys.map((key) => {
      const value = key in schema.current ? schema.current[key] : schema.defaults[key];
      const type: FieldType =
        typeof value === "boolean" ? "boolean" : typeof value === "number" ? "number" : typeof value === "string" ? "string" : "multiline";
      return { key, type };
    });
  }

  const fields = $derived(schema.fields?.length ? schema.fields : inferredFields());
  const actions = $derived<ActionSpec[]>(schema.actions ?? []);

  const groups = $derived.by(() => {
    const order: string[] = [];
    const byGroup = new Map<string, FieldSpec[]>();
    for (const field of fields) {
      const g = field.group ?? "";
      if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
      byGroup.get(g)!.push(field);
    }
    return order.map((g) => ({ name: g, fields: byGroup.get(g)! }));
  });

  function initialValue(field: FieldSpec): unknown {
    const raw = field.key in schema.current ? schema.current[field.key] : schema.defaults[field.key];
    if (field.type === "multiline") return raw === undefined ? "" : typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    if (field.type === "list") return Array.isArray(raw) ? raw : [];
    if (field.type === "secret") return "";
    if (field.type === "select") return raw === undefined ? "" : String(raw);
    return raw;
  }

  // A <select>'s option values are strings; coerce the obvious primitives back so
  // an option value of "true"/"false"/"null"/"42" is stored with its real type.
  function coercePrimitive(value: string): unknown {
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
    return value;
  }

  let values = $state<Record<string, unknown>>({});
  let saved = $state<Record<string, boolean>>({});
  let errors = $state<Record<string, string>>({});
  let actionBusy = $state<Record<string, boolean>>({});
  let actionOut = $state<Record<string, string>>({});
  let actionErr = $state<Record<string, string>>({});
  let confirming = $state<string | null>(null);

  $effect(() => {
    const next: Record<string, unknown> = {};
    for (const field of fields) next[field.key] = initialValue(field);
    values = next;
  });

  function coerceForSave(field: FieldSpec, value: unknown): unknown {
    if (field.type === "number") return Number(value);
    if (field.type === "select") return coercePrimitive(String(value));
    if (field.type === "multiline") {
      const text = String(value ?? "");
      const trimmed = text.trim();
      if (/^[[{]/.test(trimmed)) { try { return JSON.parse(trimmed); } catch { return text; } }
      return text;
    }
    return value;
  }

  async function save(field: FieldSpec, value: unknown): Promise<void> {
    values = { ...values, [field.key]: value };
    const toWrite = coerceForSave(field, value);
    const result = await cairn.configWrite(homeId, schema.plugin, field.key, toWrite);
    if (result.ok) {
      saved = { ...saved, [field.key]: true };
      errors = { ...errors, [field.key]: "" };
    } else {
      saved = { ...saved, [field.key]: false };
      errors = { ...errors, [field.key]: result.error };
    }
  }

  function addListItem(field: FieldSpec): void {
    const list = [...((values[field.key] as unknown[]) ?? [])];
    list.push(field.itemType === "number" ? 0 : "");
    save(field, list);
  }
  function setListItem(field: FieldSpec, index: number, raw: string): void {
    const list = [...((values[field.key] as unknown[]) ?? [])];
    list[index] = field.itemType === "number" ? Number(raw) : raw;
    save(field, list);
  }
  function removeListItem(field: FieldSpec, index: number): void {
    const list = [...((values[field.key] as unknown[]) ?? [])];
    list.splice(index, 1);
    save(field, list);
  }

  async function runAction(action: ActionSpec): Promise<void> {
    confirming = null;
    if (actionBusy[action.id]) return;
    actionBusy = { ...actionBusy, [action.id]: true };
    actionErr = { ...actionErr, [action.id]: "" };
    actionOut = { ...actionOut, [action.id]: "" };
    try {
      const result = await cairn.configAction(homeId, schema.plugin, action.id);
      if (result.ok) actionOut = { ...actionOut, [action.id]: result.data.stdout || "Done." };
      else actionErr = { ...actionErr, [action.id]: result.error };
    } finally {
      actionBusy = { ...actionBusy, [action.id]: false };
    }
  }

  function onAction(action: ActionSpec): void {
    if (action.confirm) confirming = action.id;
    else runAction(action);
  }

  // Visible labels stay clean; aria-labels are plugin-prefixed so a screen with
  // several plugins never has two identically-named controls.
  function aria(field: FieldSpec): string {
    return `${schema.plugin} ${field.label ?? field.key}`;
  }
</script>

{#if fields.length === 0 && actions.length === 0}
  <p class="empty">No controls.</p>
{/if}

{#each groups as group (group.name)}
  <div class="group">
    {#if group.name}<p class="grouphead">{group.name}</p>{/if}
    {#each group.fields as field (field.key)}
      <div class="field" data-testid={"control-" + field.key}>
        <div class="labels">
          <span class="label">{field.label ?? field.key}</span>
          {#if field.description}<span class="desc">{field.description}</span>{/if}
        </div>
        <div class="widget">
          {#if field.type === "boolean"}
            <ToggleSwitch checked={values[field.key] as boolean} label={aria(field)} onchange={(on) => save(field, on)} />
          {:else if field.type === "number"}
            <input type="number" aria-label={aria(field)} min={field.min} max={field.max} step={field.step}
              value={values[field.key] as number} onchange={(e) => save(field, Number(e.currentTarget.value))} />
          {:else if field.type === "secret"}
            <input type="password" aria-label={aria(field)} placeholder={field.placeholder ?? "Set new value"}
              onchange={(e) => save(field, e.currentTarget.value)} />
          {:else if field.type === "select"}
            <select aria-label={aria(field)} value={values[field.key] as string} onchange={(e) => save(field, e.currentTarget.value)}>
              {#each field.options ?? [] as opt (opt.value)}<option value={opt.value}>{opt.label}</option>{/each}
            </select>
          {:else if field.type === "list"}
            <div class="list">
              {#each (values[field.key] as unknown[]) ?? [] as item, i}
                <div class="listrow">
                  <input type={field.itemType === "number" ? "number" : "text"} aria-label={`${aria(field)} ${i + 1}`}
                    value={item as string | number} onchange={(e) => setListItem(field, i, e.currentTarget.value)} />
                  <button class="rm" title="Remove" aria-label="Remove" onclick={() => removeListItem(field, i)}>×</button>
                </div>
              {/each}
              <button class="add" onclick={() => addListItem(field)}>+ Add</button>
            </div>
          {:else}
            <textarea aria-label={aria(field)} rows="3" placeholder={field.placeholder}
              value={values[field.key] as string} onchange={(e) => save(field, e.currentTarget.value)}></textarea>
          {/if}
          {#if errors[field.key]}<span class="fielderror">{errors[field.key]}</span>
          {:else if saved[field.key]}<span class="fieldsaved">Saved</span>{/if}
        </div>
      </div>
    {/each}
  </div>
{/each}

{#if actions.length > 0}
  <div class="actions">
    {#each actions as action (action.id)}
      <div class="action">
        <div class="labels">
          <span class="label">{action.label}</span>
          {#if action.description}<span class="desc">{action.description}</span>{/if}
        </div>
        {#if confirming === action.id}
          <div class="confirm">
            <span>{action.confirm}</span>
            <Button onclick={() => (confirming = null)}>Cancel</Button>
            <Button variant={action.danger ? "danger" : "primary"} onclick={() => runAction(action)}>Confirm</Button>
          </div>
        {:else}
          <Button variant={action.danger ? "danger" : "default"} disabled={actionBusy[action.id]} onclick={() => onAction(action)}>
            {#if actionBusy[action.id]}<Spinner />{/if}
            {action.label}
          </Button>
        {/if}
        {#if actionErr[action.id]}<span class="fielderror">{actionErr[action.id]}</span>
        {:else if actionOut[action.id]}<pre class="actionout">{actionOut[action.id]}</pre>{/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0;
  }
  .grouphead {
    margin: 8px 0 0;
    font-size: 10.5px;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 600;
  }
  .field {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  .labels {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }
  .label {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: -.01em;
  }
  .desc {
    font-size: 11.5px;
    color: var(--muted);
  }
  .widget {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex: none;
  }
  input[type="text"],
  input[type="number"],
  input[type="password"],
  select,
  textarea {
    font-family: var(--ui);
    font-size: 12.5px;
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    width: 200px;
  }
  textarea {
    font-family: var(--mono);
    font-size: 11.5px;
    resize: vertical;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .listrow {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .rm {
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--faint);
    border-radius: 6px;
    cursor: pointer;
    width: 26px;
    height: 26px;
    flex: none;
  }
  .add {
    align-self: flex-end;
    border: 1px dashed var(--border-strong);
    background: none;
    color: var(--muted);
    border-radius: 7px;
    padding: 5px 10px;
    font-size: 11.5px;
    cursor: pointer;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
    border-top: 1px solid var(--border);
    padding-top: 12px;
  }
  .action {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .confirm {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
  }
  .actionout {
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--faint);
    background: var(--surface-2);
    border-radius: 7px;
    padding: 6px 9px;
    max-width: 100%;
    overflow: auto;
    flex-basis: 100%;
  }
  .fielderror {
    color: var(--crit);
    font-size: 11px;
  }
  .fieldsaved {
    color: var(--good);
    font-size: 11px;
  }
  .empty {
    margin: 0;
    color: var(--faint);
    font-size: 12.5px;
  }
</style>
