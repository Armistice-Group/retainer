import "server-only";
import { decrypt } from "@/lib/crypto";
import type { GithubConnection } from "@/generated/prisma/client";

export { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const API_BASE = "https://api.github.com";
// GitHub OAuth Apps have no read-only repo scope — "repo" grants read/write on
// private repos. We only ever call read endpoints with it.
const SCOPE = "read:user repo";
const USER_AGENT = "Consultainer-AI-Code-Health";

export class GithubError extends Error {}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new GithubError(`${name} is not configured.`);
  return value;
}

export function getAuthorizationUrl(state: string, redirectUri: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: env("GITHUB_CLIENT_ID"),
      client_secret: env("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GithubError(`GitHub token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    throw new GithubError(data.error_description ?? data.error ?? "GitHub token exchange failed.");
  }
  return data.access_token;
}

async function ghFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": USER_AGENT,
      ...init?.headers,
    },
  });
  return res;
}

export function accessTokenFor(connection: GithubConnection) {
  return decrypt(connection.accessToken);
}

export async function fetchViewerLogin(accessToken: string) {
  const res = await ghFetch(accessToken, "/user");
  if (!res.ok) throw new GithubError(`Couldn't read the GitHub account (${res.status}).`);
  const data = (await res.json()) as { login: string };
  return data.login;
}

export type GithubRepoOption = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
};

export async function listAccessibleRepos(accessToken: string) {
  const repos: GithubRepoOption[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await ghFetch(
      accessToken,
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`
    );
    if (!res.ok) throw new GithubError(`Couldn't list GitHub repos (${res.status}).`);
    const batch = (await res.json()) as Array<{
      name: string;
      full_name: string;
      private: boolean;
      owner: { login: string };
    }>;
    for (const r of batch) {
      repos.push({ owner: r.owner.login, name: r.name, fullName: r.full_name, private: r.private });
    }
    if (batch.length < 100) break;
  }
  return repos;
}

export async function getDefaultBranch(accessToken: string, owner: string, name: string) {
  const res = await ghFetch(accessToken, `/repos/${owner}/${name}`);
  if (!res.ok) throw new GithubError(`Couldn't read repo ${owner}/${name} (${res.status}).`);
  const data = (await res.json()) as { default_branch: string };
  return data.default_branch;
}

export type GithubTreeEntry = { path: string; type: "blob" | "tree"; size?: number };

export async function getRepoTree(accessToken: string, owner: string, name: string, branch: string) {
  const res = await ghFetch(
    accessToken,
    `/repos/${owner}/${name}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  if (!res.ok) throw new GithubError(`Couldn't read the file tree for ${owner}/${name} (${res.status}).`);
  const data = (await res.json()) as { tree: GithubTreeEntry[]; truncated: boolean };
  return data.tree.filter((e) => e.type === "blob");
}

/** Fetches a single file's text content via the Contents API, as instructed —
 * no local clone. Returns null for missing files or ones too large for this
 * endpoint to inline (>~1MB; GitHub omits `content` in that case). */
export async function getFileContent(
  accessToken: string,
  owner: string,
  name: string,
  path: string,
  ref: string
) {
  const res = await ghFetch(
    accessToken,
    `/repos/${owner}/${name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (!data.content || data.encoding !== "base64") return null;
  return Buffer.from(data.content, "base64").toString("utf8");
}
