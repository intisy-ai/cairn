import { anthropicProfile } from "@claude-code-proxy/index.js";
import { opencodeProfile } from "@opencode-proxy/index.js";
import type { RoutingProfile } from "@core-proxy/index.js";

export type RoutingApp = { app: "claude" | "opencode"; label: string };

type Entry = { app: "claude" | "opencode"; label: string; profile: () => RoutingProfile };

const ENTRIES: readonly Entry[] = [
  { app: "claude", label: "Claude Code", profile: anthropicProfile },
  { app: "opencode", label: "OpenCode", profile: opencodeProfile },
];

export function availableRoutingApps(present: { claude: boolean; opencode: boolean }): RoutingApp[] {
  return ENTRIES.filter((e) => present[e.app]).map((e) => ({ app: e.app, label: e.label }));
}

export function profileFor(app: string): RoutingProfile | null {
  const entry = ENTRIES.find((e) => e.app === app);
  return entry ? entry.profile() : null;
}
