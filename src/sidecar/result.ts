import type { Result } from "../../packages/shared/src/domain.js";
export const ok = <T>(data: T): Result<T> => ({ ok: true, data });
export const err = (error: string): Result<never> => ({ ok: false, error });
export async function wrap<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try { return ok(await fn()); } catch (e) { return err(e instanceof Error ? e.message : String(e)); }
}
