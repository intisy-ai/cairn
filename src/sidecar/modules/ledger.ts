import { openLedger, type Ledger } from "@config-ledger/lib.js";
import type { Result, ConfigHomeView, ConfigDiffRow, ProfileSwitchResult, PluginHome } from "../../../packages/shared/src/domain.js";
import { pluginHomes } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

export interface LedgerDeps {
  homes?: () => Promise<PluginHome[]>;
  open?: (home: string) => Ledger;
}

const EMPTY_VIEW = (h: PluginHome): ConfigHomeView => ({
  homeId: h.id,
  label: h.label,
  icon: h.icon,
  present: h.present,
  snapshots: [],
  pending: [],
  profiles: { list: [], current: "" },
});

async function openFor(homeId: string, deps: LedgerDeps): Promise<Ledger> {
  const listHomes = deps.homes ?? pluginHomes;
  const open = deps.open ?? openLedger;
  const home = (await listHomes()).find((h) => h.id === homeId);
  if (!home) throw new Error(`unknown config home: ${homeId}`);
  return open(home.dir);
}

export function ledgerHomes(deps: LedgerDeps = {}): Promise<Result<ConfigHomeView[]>> {
  const listHomes = deps.homes ?? pluginHomes;
  const open = deps.open ?? openLedger;
  return wrap(async () => {
    const homes = (await listHomes()).filter((h) => h.present);
    return homes.map((h) => {
      // A home with no data repo yet (or a git hiccup) must not blank the screen:
      // fall back to an empty view so the other homes still render.
      try {
        const led = open(h.dir);
        return {
          homeId: h.id,
          label: h.label,
          icon: h.icon,
          present: h.present,
          snapshots: led.snapshots(),
          pending: led.diffHead(),
          profiles: { list: led.profiles.list(), current: led.profiles.current() },
        };
      } catch {
        return EMPTY_VIEW(h);
      }
    });
  });
}

export function ledgerCommit(home: string, reason: string, deps: LedgerDeps = {}): Promise<Result<boolean>> {
  return wrap(async () => {
    const led = await openFor(home, deps);
    led.ensureRepo();
    return led.commit(reason);
  });
}

export function ledgerRestore(home: string, ref: string, deps: LedgerDeps = {}): Promise<Result<number>> {
  return wrap(async () => (await openFor(home, deps)).restore(ref));
}

export function ledgerDiffRefs(home: string, refA: string, refB: string, deps: LedgerDeps = {}): Promise<Result<ConfigDiffRow[]>> {
  return wrap(async () => (await openFor(home, deps)).diffRefs(refA, refB));
}

export function ledgerProfileCreate(home: string, name: string, deps: LedgerDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const led = await openFor(home, deps);
    led.ensureRepo();
    led.profiles.create(name);
  });
}

export function ledgerProfileSwitch(home: string, name: string, deps: LedgerDeps = {}): Promise<Result<ProfileSwitchResult>> {
  return wrap(async () => {
    const res = (await openFor(home, deps)).profiles.switchTo(name);
    return { ok: res.ok, reason: res.reason };
  });
}
