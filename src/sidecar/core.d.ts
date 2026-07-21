// core ships a bundled dist/index.js with no accompanying .d.ts; this shims the
// subset of its API this app consumes so imports through the @core/* alias type-check.
declare module "@core/index.js" {
  export function getConfigValue(name: string, key: string, configDir?: string): unknown;
  export function setConfigValue(name: string, key: string, value: unknown, configDir?: string): void;
}
