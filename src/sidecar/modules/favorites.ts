import { getConfigValue, setConfigValue } from "@core/index.js";
import type { Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

function readFavorites(): string[] {
  const value = getConfigValue("cairn", "favoritePlugins");
  return Array.isArray(value) ? (value as string[]) : [];
}

export function favoritesList(): Promise<Result<string[]>> {
  return wrap(() => readFavorites());
}

export function favoritesToggle(name: string): Promise<Result<string[]>> {
  return wrap(() => {
    const current = readFavorites();
    const next = current.includes(name) ? current.filter((n) => n !== name) : [...current, name];
    setConfigValue("cairn", "favoritePlugins", next);
    return next;
  });
}
