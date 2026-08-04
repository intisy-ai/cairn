import { ECOSYSTEM_ORG } from "@core/index.js";
import type { EngineDescriptor } from "@core/index.js";

// custom-auth is a provider (an account/credential backend), not a generic
// ecosystem engine, so it does not live in core's BUILTIN_ENGINES. Cairn's
// custom-endpoints feature is inherently built on that provider, so the
// descriptor pointing at it is Cairn's own data.
export const CAIRN_ENGINES: EngineDescriptor[] = [
  {
    id: "custom-auth",
    url: `https://github.com/${ECOSYSTEM_ORG}/custom-auth`,
    capability: "custom-endpoints",
    target: "cairn",
    meta: { providerId: "custom", configName: "custom-auth" },
  },
];
