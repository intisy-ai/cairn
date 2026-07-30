// config-ledger ships a bundled dist/lib.js with no accompanying .d.ts; this shims
// the subset this app consumes so imports through the @config-ledger/* alias type-check.
declare module "@config-ledger/lib.js" {
  export interface LedgerSnapshot { hash: string; date: string; subject: string }
  export interface LedgerDiffRow { file: string; key: string; old: string; new: string }
  export interface LedgerProfiles {
    list(): string[];
    current(): string;
    create(name: string): void;
    switchTo(name: string): { ok: boolean; reason?: string; profile?: string; files?: number };
  }
  export interface Ledger {
    home?: string;
    ensureRepo(): void;
    snapshots(): LedgerSnapshot[];
    history(file: string, key: string): { hash: string; date: string; value: unknown }[];
    commit(reason: string): boolean;
    diffHead(): LedgerDiffRow[];
    diffRefs(refA: string, refB: string): LedgerDiffRow[];
    restore(ref: string): number;
    rollbackKey(file: string, key: string, hash: string): boolean;
    profiles: LedgerProfiles;
  }
  export function openLedger(home?: string): Ledger;
}
