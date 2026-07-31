import { pathToFileURL } from "node:url";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";
import type { LoginBegin, LoginComplete, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

type LoginFlow = {
  url: string;
  instructions?: string;
  loopback?: boolean;
  complete: (input: string) => Promise<{ id?: string; label?: string } | null>;
  cancel?: () => void | Promise<void>;
};

export interface AccountsLoginDeps {
  resolveLoginFlow?: (provider: string) => Promise<LoginFlow | null>;
}

const pending = new Map<string, LoginFlow>();

async function realResolveLoginFlow(provider: string): Promise<LoginFlow | null> {
  const deployed = readDeployedProviders(reposDir()).find((p) => p.provider === provider);
  if (!deployed) return null;
  try {
    const mod = await import(pathToFileURL(deployed.handlerPath).href);
    const factory = mod.loginFlow as (() => LoginFlow | Promise<LoginFlow> | undefined) | undefined;
    if (typeof factory !== "function") return null;
    const flow = await factory();
    return flow ?? null;
  } catch {
    return null;
  }
}

export async function accountsLoginBegin(provider: string, deps: AccountsLoginDeps = {}): Promise<Result<LoginBegin>> {
  try {
    const existing = pending.get(provider);
    if (existing) {
      await existing.cancel?.();
      pending.delete(provider);
    }
    const resolve = deps.resolveLoginFlow ?? realResolveLoginFlow;
    const flow = await resolve(provider);
    if (!flow) return err("this provider does not support in-app login");
    pending.set(provider, flow);
    return ok({ url: flow.url, instructions: flow.instructions ?? "", loopback: flow.loopback });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function accountsLoginComplete(provider: string, input: string): Promise<Result<LoginComplete>> {
  const flow = pending.get(provider);
  if (!flow) return err("no login in progress for this provider");
  try {
    const account = await flow.complete(input.trim());
    pending.delete(provider);
    return ok({ added: !!account, label: account?.label });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

export async function accountsLoginCancel(provider: string): Promise<Result<void>> {
  const flow = pending.get(provider);
  if (flow) {
    try {
      await flow.cancel?.();
    } catch {
      /* best effort */
    }
    pending.delete(provider);
  }
  return ok(undefined);
}
