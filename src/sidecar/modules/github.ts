import { getConfigValue, setConfigValue } from "@core/index.js";
import { realExec, resetOrgScanCache, resolveToken } from "../lib/orgScan.js";
import type { GithubAccountView, GithubStatus, Result } from "../../../packages/shared/src/domain.js";
import { ok, err, wrap } from "../result.js";

export interface GithubDeps {
  fetchFn?: typeof fetch;
  execFn?: (file: string, args: string[]) => Promise<string>;
  env?: NodeJS.ProcessEnv;
}

interface StoredGithubAccount { login: string; token: string }

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

function storedAccounts(): StoredGithubAccount[] {
  const accounts = getConfigValue("cairn", "githubAccounts");
  return Array.isArray(accounts) ? (accounts as StoredGithubAccount[]) : [];
}

function activeLoginOf(accounts: StoredGithubAccount[]): string | null {
  const configured = getConfigValue("cairn", "githubActiveLogin");
  if (typeof configured === "string" && accounts.some((a) => a.login === configured)) return configured;
  return accounts[0]?.login ?? null;
}

export function githubStatus(deps: GithubDeps = {}): Promise<Result<GithubStatus>> {
  return wrap(async () => {
    const env = deps.env ?? process.env;
    const execFn = deps.execFn ?? realExec;
    const fetchFn = deps.fetchFn ?? fetch;
    const { token, source } = await resolveToken(env, execFn);
    const ghCliDetected = await detectGhCli(execFn);
    const login = token ? await fetchLogin(fetchFn, token) : null;
    const accounts = storedAccounts();
    const accountViews: GithubAccountView[] = accounts.map((a) => ({ login: a.login }));
    return { source, connected: token !== null, login, ghCliDetected, accounts: accountViews, activeLogin: activeLoginOf(accounts) };
  });
}

export async function githubAddAccount(token: string, deps: GithubDeps = {}): Promise<Result<{ login: string }>> {
  const fetchFn = deps.fetchFn ?? fetch;
  const trimmed = token.trim();
  if (!trimmed) return err("token is required");
  let login: string;
  try {
    const response = await fetchFn("https://api.github.com/user", { headers: { Authorization: `Bearer ${trimmed}` } });
    if (!response.ok) return err(`GitHub rejected the token (${response.status})`);
    const json = (await response.json()) as { login?: string };
    if (typeof json.login !== "string" || !json.login) return err("GitHub response had no login");
    login = json.login;
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
  const accounts = storedAccounts().filter((a) => a.login !== login);
  accounts.push({ login, token: trimmed });
  setConfigValue("cairn", "githubAccounts", accounts);
  setConfigValue("cairn", "githubActiveLogin", login);
  resetOrgScanCache();
  return ok({ login });
}

export async function githubSwitchAccount(login: string, _deps: GithubDeps = {}): Promise<Result<void>> {
  const accounts = storedAccounts();
  if (!accounts.some((a) => a.login === login)) return err("unknown account");
  setConfigValue("cairn", "githubActiveLogin", login);
  resetOrgScanCache();
  return ok(undefined);
}

export async function githubRemoveAccount(login: string, _deps: GithubDeps = {}): Promise<Result<void>> {
  const accounts = storedAccounts();
  const remaining = accounts.filter((a) => a.login !== login);
  setConfigValue("cairn", "githubAccounts", remaining);
  const activeLogin = getConfigValue("cairn", "githubActiveLogin");
  if (activeLogin === login) setConfigValue("cairn", "githubActiveLogin", remaining[0]?.login ?? "");
  resetOrgScanCache();
  return ok(undefined);
}
