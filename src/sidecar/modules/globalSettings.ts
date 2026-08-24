import { globalSettingsSchema, loadConfig, type FieldSpec } from "@intisy-ai/core";
import type { Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export interface GlobalSettingsDeps {
  schema?: () => { defaults: Record<string, unknown>; fields: FieldSpec[] };
  read?: (name: string) => Record<string, unknown>;
}

export interface GlobalSettingsView {
  defaults: Record<string, unknown>;
  fields: FieldSpec[];
  current: Record<string, unknown>;
}

// The dashboard edits the settings of the home it runs in; every other home's copy is
// reconciled on disk by the sync plugin, so there is nothing per-home to choose here.
export function globalSettingsRead(deps: GlobalSettingsDeps = {}): Promise<Result<GlobalSettingsView>> {
  const schema = deps.schema ?? globalSettingsSchema;
  const read = deps.read ?? ((name: string) => loadConfig(name));
  return wrap(async () => {
    const { defaults, fields } = schema();
    return { defaults, fields, current: { ...read("settings") } };
  });
}
