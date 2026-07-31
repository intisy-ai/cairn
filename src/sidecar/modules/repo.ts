import { resolveToken, realExec } from "../lib/orgScan.js";
import { readCache, writeCache } from "../lib/cache.js";
import { getConfigDir } from "@core-auth/index.js";
import type { RepoMeta, Result } from "../../../packages/shared/src/domain.js";
import { wrap, err } from "../result.js";

const TTL_MS = 1_800_000;
const README_CAP = 200_000;
const REPO_META_NS = "repoMeta";

const cache = new Map<string, { at: number; value: RepoMeta }>();
export function resetRepoMetaCacheForTests(): void { cache.clear(); }

export interface RepoMetaDeps {
  fetchFn?: typeof fetch;
  execFn?: (file: string, args: string[]) => Promise<string>;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  // Where the persistent cache lives; "" disables disk persistence (used in tests).
  cacheDir?: string;
}

// The last-known repo meta from the persistent cache, for instant display while a
// fresh repoMeta() fetch runs in the background. Null when nothing is cached yet.
export function repoMetaCached(url: string, cacheDir?: string): Promise<Result<RepoMeta | null>> {
  return wrap(async () => readCache<RepoMeta>(REPO_META_NS, url, cacheDir ?? getConfigDir())?.value ?? null);
}

// Accepts a full github.com URL or an `owner/repo` shorthand (engines use the
// shorthand form), returning null for anything that is not a GitHub repo.
export function parseOwnerRepo(url: string): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\.git$/, "").replace(/\/$/, "");
  const full = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (full) return { owner: full[1], repo: full[2] };
  const short = cleaned.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (short) return { owner: short[1], repo: short[2] };
  return null;
}

function decodeBase64(content: string): string {
  return Buffer.from(content.replace(/\s/g, ""), "base64").toString("utf-8");
}

export function repoMeta(url: string, deps: RepoMetaDeps = {}): Promise<Result<RepoMeta>> {
  const parsed = parseOwnerRepo(url);
  if (!parsed) return Promise.resolve(err(`not a GitHub repo: ${url}`));
  const now = deps.now ?? Date.now;
  const cached = cache.get(url);
  if (cached && now() - cached.at < TTL_MS) return Promise.resolve({ ok: true, data: cached.value });

  const fetchFn = deps.fetchFn ?? fetch;
  return wrap(async () => {
    const { token } = await resolveToken(deps.env ?? process.env, deps.execFn ?? realExec);
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const repoRes = await fetchFn(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers });
    if (!repoRes.ok) throw new Error(`repo http ${repoRes.status}`);
    const repoJson = (await repoRes.json()) as {
      stargazers_count?: number;
      description?: string | null;
      topics?: string[];
      html_url?: string;
    };

    let readme: string | null = null;
    try {
      const readmeRes = await fetchFn(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/readme`, { headers });
      if (readmeRes.ok) {
        const readmeJson = (await readmeRes.json()) as { content?: string; encoding?: string };
        if (readmeJson.encoding === "base64" && typeof readmeJson.content === "string") {
          readme = decodeBase64(readmeJson.content).slice(0, README_CAP);
        }
      }
    } catch {
      // a missing or unreadable README leaves it null; the rest of the meta stands
    }

    const value: RepoMeta = {
      owner: parsed.owner,
      repo: parsed.repo,
      htmlUrl: repoJson.html_url ?? `https://github.com/${parsed.owner}/${parsed.repo}`,
      stars: typeof repoJson.stargazers_count === "number" ? repoJson.stargazers_count : null,
      description: repoJson.description ?? "",
      topics: Array.isArray(repoJson.topics) ? repoJson.topics : [],
      readme,
    };
    cache.set(url, { at: now(), value });
    writeCache(REPO_META_NS, url, value, deps.cacheDir ?? getConfigDir());
    return value;
  });
}
