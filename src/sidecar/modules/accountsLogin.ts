import { pathToFileURL } from "node:url";
import { readDeployedProviders } from "@core-loader/loader-runtime.js";
import { reposDir } from "@core-auth/index.js";
import type { LoginBegin, LoginComplete, Result } from "../../../packages/shared/src/domain.js";
import { ok, err } from "../result.js";

type LoginAccount = { id?: string; label?: string };

type LoginFlow = {
  url: string;
  instructions?: string;
  // A provider that can catch the browser redirect itself hands back a promise that
  // resolves once the callback lands, NOT a flag. It holds a live listener, so it can
  // never be forwarded to the renderer.
  loopback?: Promise<LoginAccount | null>;
  complete: (input: string) => Promise<LoginAccount | null>;
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
    // The provider's own listener saves the account when the callback lands, and says so on
    // the event bus. All this has to do is retire the flow so a later paste cannot run it
    // twice, and never leave the promise unhandled.
    void flow.loopback?.then(
      () => { if (pending.get(provider) === flow) pending.delete(provider); },
      () => { /* a closed or timed-out listener is not a failure of this call */ },
    );
    return ok({ url: flow.url, instructions: flow.instructions ?? "", loopback: !!flow.loopback });
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
