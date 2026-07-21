import { pathToFileURL } from "node:url";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir, LockTimeoutError } from "@core-auth/index.js";
import type { AccountController } from "@core-auth/index.js";
import type { AccountView, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

async function resolveController(provider: string): Promise<AccountController | null> {
  const deployed = readDeployedProviders(reposDir()).find((p) => p.provider === provider);
  if (!deployed) return null;
  try {
    const mod = await import(pathToFileURL(deployed.handlerPath).href);
    return (mod.accounts as AccountController | undefined) ?? null;
  } catch {
    return null;
  }
}

async function guarded<T>(fn: () => Promise<T> | T): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    if (e instanceof LockTimeoutError) return err(`account store is locked: ${e.message}`);
    return err(e instanceof Error ? e.message : String(e));
  }
}

async function requireController(provider: string): Promise<AccountController> {
  const controller = await resolveController(provider);
  if (!controller) throw new Error(`no accounts controller for provider: ${provider}`);
  return controller;
}

export function accountsList(provider: string): Promise<Result<AccountView[]>> {
  return guarded(async () => (await requireController(provider)).list());
}

export function accountsEnable(provider: string, id: string, on: boolean): Promise<Result<void>> {
  return guarded(async () => {
    (await requireController(provider)).enable(id, on);
  });
}

export function accountsRemove(provider: string, id: string): Promise<Result<void>> {
  return guarded(async () => {
    (await requireController(provider)).remove(id);
  });
}

export function accountsRefreshQuota(provider: string): Promise<Result<AccountView[]>> {
  return guarded(async () => {
    const controller = await requireController(provider);
    if (controller.refreshQuota) await controller.refreshQuota();
    return controller.list();
  });
}
