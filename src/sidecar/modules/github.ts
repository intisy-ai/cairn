import { setConfigValue } from "@core/index.js";
import { realExec, resetOrgScanCache, resolveToken } from "../lib/orgScan.js";
import type { GithubStatus, Result } from "../../../packages/shared/src/domain.js";
import { wrap } from "../result.js";

export interface GithubDeps {
  fetchFn?: typeof fetch;
  execFn?: (file: string, args: string[]) => Promise<string>;
  env?: NodeJS.ProcessEnv;
}

async function detectGhCli(execFn: (file: string, args: string[]) => Promise<string>): Promise<boolean> {
  try {
    const out = (await execFn("gh", ["auth", "token"])).trim();
    return out.length > 0;
  } catch {
    return false;
  }
}

async function fetchLogin(fetchFn: typeof fetch, token: string): Promise<string | null> {
  try {
    const response = await fetchFn("https://api.github.com/user", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const json = (await response.json()) as { login?: string };
    return typeof json.login === "string" ? json.login : null;
  } catch {
    return null;
  }
}

export function githubStatus(deps: GithubDeps = {}): Promise<Result<GithubStatus>> {
  return wrap(async () => {
    const env = deps.env ?? process.env;
    const execFn = deps.execFn ?? realExec;
    const fetchFn = deps.fetchFn ?? fetch;
    const { token, source } = await resolveToken(env, execFn);
    const ghCliDetected = await detectGhCli(execFn);
    const login = token ? await fetchLogin(fetchFn, token) : null;
    return { source, connected: token !== null, login, ghCliDetected };
  });
}

export function githubSetToken(token: string, _deps: GithubDeps = {}): Promise<Result<void>> {
  return wrap(() => {
    setConfigValue("cairn", "githubToken", token.trim());
    resetOrgScanCache();
  });
}
