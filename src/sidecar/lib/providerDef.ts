import { pathToFileURL } from "node:url";

export type ProviderMeta = {
  id: string;
  label: string;
  models: Record<string, unknown>;
  hasOAuth: boolean;
  settings?: unknown;
};

export async function loadProviderDef(handlerPath: string): Promise<ProviderMeta | null> {
  try {
    const mod = await import(pathToFileURL(handlerPath).href);
    return (mod.def as ProviderMeta | undefined) ?? null;
  } catch {
    return null;
  }
}
