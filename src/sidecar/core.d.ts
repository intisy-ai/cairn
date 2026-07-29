// core ships a bundled dist/index.js with no accompanying .d.ts; this shims the
// subset of its API this app consumes so imports through the @core/* alias type-check.
declare module "@core/index.js" {
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
    commandsSubdir: string;
    proxyPort: number;
    integration: "env-baseurl" | "native";
    wireFormat: string;
    builtin: boolean;
  }
  export function getApps(env?: NodeJS.ProcessEnv, home?: string): AppDescriptor[];
  export function getAppDescriptor(id: string, env?: NodeJS.ProcessEnv, home?: string): AppDescriptor | undefined;
  export function resolveHome(desc: AppDescriptor, env?: NodeJS.ProcessEnv, home?: string): string;
}
