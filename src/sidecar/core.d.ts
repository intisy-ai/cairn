// core ships a bundled dist/index.js with no accompanying .d.ts; this shims the
// subset of its API this app consumes so imports through the @core/* alias type-check.
declare module "@core/index.js" {
  export const ECOSYSTEM_ORG: string;
  export function getConfigValue(name: string, key: string, configDir?: string): unknown;
  export function setConfigValue(name: string, key: string, value: unknown, configDir?: string): void;
  export interface AppDescriptor {
    id: string;
    label: string;
    icon?: string;
    home: {
      envOverride?: string;
      nativeEnv?: string;
      xdgSubdir?: string;
      candidates: string[];
    };
    detect: { binary: string; pkg: string };
    loader?: { id: string; url: string };
    commandsSubdir: string;
    proxyPort: number;
    integration: "env-baseurl" | "native";
    wireFormat: string;
    usage?: { formats: string[] };
  }
  export function getApps(env?: NodeJS.ProcessEnv, home?: string): AppDescriptor[];
  export function getAppDescriptor(id: string, env?: NodeJS.ProcessEnv, home?: string): AppDescriptor | undefined;
  export function resolveHome(desc: AppDescriptor, env?: NodeJS.ProcessEnv, home?: string): string;
  export function registerApp(desc: AppDescriptor, env?: NodeJS.ProcessEnv, home?: string): void;
  export interface EventEnvelope<T = unknown> { v: 1; id: string; ts: number; topic: string; source: string; payload: T; }
  export function drainHomes(homes: string[], consumerId: string, handler: (e: EventEnvelope) => void): number;
  export function subscribeHomes(homes: string[], topics: string | string[], handler: (e: EventEnvelope) => void, opts?: { fromStart?: boolean; pollMs?: number }): () => void;
  export type Impact = "debug" | "info" | "notice" | "warning" | "error";
  export interface ActivitySubject { kind: string; id?: string; label?: string; }
  export interface ActivityRecord {
    id: string;
    ts: number;
    home: string;
    topic: string;
    action: string;
    actor: "user" | "system" | "app";
    impact: Impact;
    source: string;
    subject?: ActivitySubject;
    details: Record<string, unknown>;
    text: string;
    origin: ActivityOrigin;
    target?: ActivityTarget;
    cause: ActivityCause;
    trace: ActivityTrace;
    outcome?: "ok" | "failed";
    durationMs?: number;
    changes?: ActivityValueChange[];
  }
  export interface ActivityQuery {
    impacts?: Impact[];
    sources?: string[];
    topics?: string[];
    subjects?: string[];
    since?: number;
    until?: number;
    search?: string;
    limit?: number;
    cursor?: string;
  }
  export type CauseKind = "user" | "startup" | "schedule" | "hook" | "watch" | "api" | "cascade" | "unknown";
  export interface ActivityOrigin { app: string; home: string; entry?: string; pid?: number; }
  export interface ActivityTarget { app?: string; home?: string; }
  export interface ActivityCause { kind: CauseKind; surface?: string; detail?: string; }
  export interface ActivityTrace { id: string; causedBy?: string; }
  export interface ActivityValueChange { key: string; from?: unknown; to?: unknown; redacted?: boolean; }
  export function setActivityContext(patch: { app?: string; entry?: string; home?: string; target?: ActivityTarget }): void;
  export function getActivityContext(): { app?: string; entry?: string; home?: string; target?: ActivityTarget };
  export function withCause<T>(cause: ActivityCause, fn: () => T): T;
  export function activityEnv(): Record<string, string>;
  export function currentCause(): ActivityCause;
  export function normalizeActivity(envelope: EventEnvelope, home?: string): ActivityRecord;
  export function readActivity(homes: string[], query?: ActivityQuery): { records: ActivityRecord[]; nextCursor?: string };
  export interface ActivityHomeStats { home: string; bytes: number; segments: number; oldestTs?: number }
  export interface ActivityStats { homes: ActivityHomeStats[]; bytes: number; segments: number; oldestTs?: number }
  export function activityStats(homes: string[]): ActivityStats;
  export interface FieldSpec {
    key: string;
    type: "boolean" | "number" | "string" | "secret" | "select" | "multiline" | "list";
    label?: string;
    description?: string;
    group?: string;
    options?: { value: string; label: string }[];
    min?: number;
    max?: number;
    step?: number;
    itemType?: "string" | "number";
    placeholder?: string;
  }
  export function globalSettingsSchema(): { defaults: Record<string, unknown>; fields: FieldSpec[] };
  export function loadConfig(name: string, configDir?: string): Record<string, unknown>;
  export interface EngineDescriptor {
    id: string;
    url: string;
    capability: string;
    target: "everywhere" | "all-apps" | "cairn";
    meta?: Record<string, string>;
  }
  export function getEngines(): EngineDescriptor[];
  export function engineByCapability(capability: string): EngineDescriptor | undefined;
  export function engineById(id: string): EngineDescriptor | undefined;
  export function isEngine(id: string): boolean;
}
