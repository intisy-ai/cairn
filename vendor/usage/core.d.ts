// core ships a bundled dist/index.js with no accompanying .d.ts; this shims the
// subset of its API the usage engine consumes so imports through the @core/* alias
// type-check. The usage engine discovers apps from the registry and resolves each
// app's home to find its session-storage.
declare module "@core/index.js" {
  export interface AppDescriptor {
    id: string;
    usage?: { formats: string[] };
  }
  export function getApps(env?: NodeJS.ProcessEnv, home?: string): AppDescriptor[];
  export function resolveHome(desc: AppDescriptor, env?: NodeJS.ProcessEnv, home?: string): string;
}
