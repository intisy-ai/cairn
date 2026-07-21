import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Chain, RoutingProfile } from "@core-proxy/index.js";

export function modelMapWrite(configDir: string, profile: RoutingProfile, slot: string, chain: Chain): void {
  const configFolder = join(configDir, "config");
  const configPath = join(configFolder, profile.configFile);
  let cfg: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) cfg = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {}
  const modelMap = (cfg.modelMap as Record<string, Chain> | undefined) ?? {};
  if (chain.length) modelMap[slot] = chain;
  else delete modelMap[slot];
  cfg.modelMap = modelMap;
  if (!existsSync(configFolder)) mkdirSync(configFolder, { recursive: true });
  writeFileSync(configPath, JSON.stringify(cfg, null, 2), "utf8");
}
