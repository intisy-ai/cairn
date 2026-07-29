import type { CatalogKind } from "./domain.js";

export type RepoRef = { owner: string; repo: string; url: string };

const GH_URL = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?\/?$/;
const SHORT = /^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/;

export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = GH_URL.exec(trimmed) ?? SHORT.exec(trimmed);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

export function classifyRepoName(name: string): CatalogKind | null {
  if (name.endsWith("-loader") || name.endsWith("-translator") || name.startsWith("core-")) return null;
  if (name.endsWith("-proxy")) return "proxy";
  if (name.endsWith("-auth")) return "provider";
  return "plugin";
}
