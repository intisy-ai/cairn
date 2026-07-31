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
    builtin: boolean;
    usage?: { formats: string[] };
  }
  export function getApps(env?: NodeJS.ProcessEnv, home?: string): AppDescriptor[];
  export function getAppDescriptor(id: string, env?: NodeJS.ProcessEnv, home?: string): AppDescriptor | undefined;
  export function resolveHome(desc: AppDescriptor, env?: NodeJS.ProcessEnv, home?: string): string;
  export interface EventEnvelope<T = unknown> { v: 1; id: string; ts: number; topic: string; source: string; payload: T; }
  export function drainHomes(homes: string[], consumerId: string, handler: (e: EventEnvelope) => void): number;
  export interface EngineDescriptor {
    id: string;
    url: string;
    capability: string;
    mandatory: boolean;
    autoInstall: "startup" | "on-demand";
    target: "all-apps" | "cairn";
    meta?: Record<string, string>;
  }
  export function getEngines(): EngineDescriptor[];
  export function engineByCapability(capability: string): EngineDescriptor | undefined;
  export function engineById(id: string): EngineDescriptor | undefined;
  export function isEngine(id: string): boolean;
  export function isMandatoryEngine(id: string): boolean;
}
