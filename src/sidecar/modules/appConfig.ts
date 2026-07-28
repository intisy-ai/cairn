import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { getPlugins } from "@plugin-updater/config.js";
import type { PluginConfigSchema, PluginHome, PluginHomeId, Result } from "../../../packages/shared/src/domain.js";
import { pluginHomes, homeDir } from "../lib/pluginHomes.js";
import { wrap } from "../result.js";

type ProbeFn = (bundlePath: string) => Promise<PluginConfigSchema | null>;

// A plugin built on core answers `node <bundle> config schema` with {name, defaults, current};
// anything else (no bundle, non-zero exit, unparseable stdout) means skip that plugin.
function realProbe(bundlePath: string): Promise<PluginConfigSchema | null> {
  return new Promise((resolve) => {
    execFile("node", [bundlePath, "config", "schema"], { timeout: 10000 }, (error, stdout) => {
      if (error) { resolve(null); return; }
      try {
        const data = JSON.parse(stdout.trim()) as { name?: unknown; defaults?: unknown; current?: unknown };
        if (typeof data.name !== "string") { resolve(null); return; }
        resolve({
          plugin: data.name,
          defaults: (data.defaults ?? {}) as Record<string, unknown>,
          current: (data.current ?? {}) as Record<string, unknown>,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

export interface ConfigSchemasDeps {
  homes?: PluginHome[];
  probe?: ProbeFn;
}

export function configSchemas(homeId: string, deps: ConfigSchemasDeps = {}): Promise<Result<PluginConfigSchema[]>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    const probe = deps.probe ?? realProbe;
    const schemas: PluginConfigSchema[] = [];
    for (const plugin of getPlugins(dir)) {
      const bundlePath = join(dir, "plugin", `${plugin.name}.js`);
      if (!existsSync(bundlePath)) continue;
      const schema = await probe(bundlePath);
      if (schema) schemas.push(schema);
    }
    return schemas;
  });
}

export interface ConfigWriteDeps {
  homes?: PluginHome[];
}

export function configWrite(homeId: string, plugin: string, key: string, value: unknown, deps: ConfigWriteDeps = {}): Promise<Result<void>> {
  return wrap(async () => {
    const homes = deps.homes ?? (await pluginHomes());
    const dir = homeDir(homeId as PluginHomeId, homes);
    if (!getPlugins(dir).some((p) => p.name === plugin)) {
      throw new Error(`plugin not found: ${plugin}`);
    }
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(`invalid config key: ${key}`);
    }
    const file = join(dir, "config", `${plugin}.json`);
    const base = resolve(dir, "config");
    if (!resolve(file).startsWith(base + sep)) {
      throw new Error(`invalid config target: ${plugin}`);
    }
    const existing = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>) : {};
    existing[key] = value;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(existing, null, 2), "utf8");
  });
}
