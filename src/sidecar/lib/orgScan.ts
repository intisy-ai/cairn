import { execFile } from "node:child_process";
import { classifyRepoName } from "../../../packages/shared/src/repoRef.js";
import type { CatalogEntry, CatalogKind, CatalogResult } from "../../../packages/shared/src/domain.js";

const ORG = "intisy-ai";
const TTL_MS = 60_000;
const EXCLUDED_EXACT = new Set(["ai-java", "workflows", "cairn", "agentbox", "core"]);

export function classifyRepo(name: string): CatalogKind | null {
  if (EXCLUDED_EXACT.has(name)) return null;
  return classifyRepoName(name);
}

interface RepoJson { name?: string; html_url?: string; description?: string | null; archived?: boolean; topics?: string[] }

let cache: { at: number; result: CatalogResult } | null = null;
const MANIFEST_TTL_MS = 1_800_000;
const manifestCache = new Map<string, { at: number; value: { displayName?: string; icon?: string } }>();
export function resetOrgScanCacheForTests(): void { cache = null; manifestCache.clear(); }

function tryExec(exe: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(exe, args, { timeout: 5000 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

// On win32 a binary may be a native .exe (gh) or an npm shim (.cmd); try the
// bare name first and only fall back to the .cmd suffix if that spawn fails.
function realExec(file: string, args: string[]): Promise<string> {
  if (process.platform !== "win32") return tryExec(file, args);
  return tryExec(file, args).catch(() => tryExec(`${file}.cmd`, args));
}

export interface OrgScanDeps { fetchFn?: typeof fetch; execFn?: (file: string, args: string[]) => Promise<string>; env?: NodeJS.ProcessEnv; now?: () => number }

async function resolveToken(env: NodeJS.ProcessEnv, execFn: (f: string, a: string[]) => Promise<string>): Promise<{ token: string | null; source: CatalogResult["source"] }> {
  const envToken = env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim();
  if (envToken) return { token: envToken, source: "env" };
  try {
    const out = (await execFn("gh", ["auth", "token"])).trim();
    if (out) return { token: out, source: "gh" };
  } catch {
    // gh unavailable or not logged in
  }
  return { token: null, source: "anonymous" };
}

// Fetch one repo's cairn.json manifest (displayName + icon) via the contents API,
// so it works for private repos with the same token. Best-effort: a repo without a
// manifest (404) returns {}. The icon SVG is base64-encoded into a data URI.
async function fetchManifest(
  fetchFn: typeof fetch,
  repo: string,
  token: string | null,
  now: () => number,
): Promise<{ displayName?: string; icon?: string }> {
  const hit = manifestCache.get(repo);
  if (hit && now() - hit.at < MANIFEST_TTL_MS) return hit.value;
  const value = await fetchManifestUncached(fetchFn, repo, token);
  manifestCache.set(repo, { at: now(), value });
  return value;
}

async function fetchManifestUncached(
  fetchFn: typeof fetch,
  repo: string,
  token: string | null,
): Promise<{ displayName?: string; icon?: string }> {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const contents = async (path: string): Promise<string | null> => {
    try {
      const response = await fetchFn(`https://api.github.com/repos/${ORG}/${repo}/contents/${path}`, { headers });
      if (!response.ok) return null;
      const json = (await response.json()) as { content?: string; encoding?: string };
      if (json.encoding !== "base64" || typeof json.content !== "string") return null;
      return json.content.replace(/\s/g, "");
    } catch {
      return null;
    }
  };
  const manifestB64 = await contents("cairn.json");
  if (!manifestB64) return {};
  try {
    const manifest = JSON.parse(Buffer.from(manifestB64, "base64").toString("utf-8"));
    const out: { displayName?: string; icon?: string } = {};
    if (typeof manifest.displayName === "string" && manifest.displayName) out.displayName = manifest.displayName;
    if (typeof manifest.icon === "string" && manifest.icon.endsWith(".svg")) {
      const iconB64 = await contents(manifest.icon);
      if (iconB64) out.icon = "data:image/svg+xml;base64," + iconB64;
    }
    return out;
  } catch {
    return {};
  }
}

export async function scanOrg(deps: OrgScanDeps = {}): Promise<CatalogResult> {
  const now = deps.now ?? Date.now;
  if (cache && now() - cache.at < TTL_MS) return cache.result;
  const fetchFn = deps.fetchFn ?? fetch;
  const { token, source } = await resolveToken(deps.env ?? process.env, deps.execFn ?? realExec);
  try {
    const entries: CatalogEntry[] = [];
    for (let page = 1; page <= 5; page++) {
      const response = await fetchFn(`https://api.github.com/orgs/${ORG}/repos?per_page=100&page=${page}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`org scan http ${response.status}`);
      const repos = (await response.json()) as RepoJson[];
      for (const repo of repos) {
        if (!repo.name) continue;
        const kind = classifyRepo(repo.name);
        if (!kind) continue;
        entries.push({ name: repo.name, url: repo.html_url ?? `https://github.com/${ORG}/${repo.name}`, kind, description: repo.description ?? "", deprecated: repo.archived === true, topics: Array.isArray(repo.topics) ? repo.topics : [] });
      }
      if (repos.length < 100) break;
    }
    // Manifest enrichment is best-effort and MUST NOT affect the base catalog.
    // Only with a token: anonymous requests share a tiny 60/hr budget that the
    // per-repo fan-out would exhaust, starving the repo-list call itself.
    if (token) {
      try {
        await Promise.all(
          entries.map(async (entry) => {
            const manifest = await fetchManifest(fetchFn, entry.name, token, now);
            if (manifest.displayName) entry.displayName = manifest.displayName;
            if (manifest.icon) entry.icon = manifest.icon;
          }),
        );
      } catch {
        // enrichment failure never empties the catalog
      }
    }
    const result: CatalogResult = { entries, source };
    if (entries.length > 0 || !cache) cache = { at: now(), result };
    return cache.result;
  } catch {
    if (cache) return cache.result;
    const empty: CatalogResult = { entries: [], source };
    return empty;
  }
}
