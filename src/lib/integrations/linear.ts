import "server-only";
import { decrypt } from "@/lib/crypto";
import type { LinearConnection } from "@/generated/prisma/client";

export { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const GRAPHQL_URL = "https://api.linear.app/graphql";
// "read" is the only scope we need — we only ever pull issues/teams, never
// create or mutate anything in Linear.
const SCOPE = "read";

export class LinearError extends Error {}

/** Whether this instance has OAuth app credentials for the integration —
 * without them the Connect flow can't start. */
export function isLinearConfigured() {
  return !!process.env.LINEAR_CLIENT_ID && !!process.env.LINEAR_CLIENT_SECRET;
}

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new LinearError(`${name} is not configured.`);
  return value;
}

export function getAuthorizationUrl(state: string, redirectUri: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env("LINEAR_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForToken(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri: redirectUri,
      client_id: env("LINEAR_CLIENT_ID"),
      client_secret: env("LINEAR_CLIENT_SECRET"),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinearError(`Linear token exchange failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) {
    throw new LinearError(data.error ?? "Linear token exchange failed.");
  }
  return data.access_token;
}

async function graphql<T>(accessToken: string, query: string, variables?: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinearError(`Linear API request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new LinearError(json.errors.map((e) => e.message).join("; "));
  }
  if (!json.data) throw new LinearError("Linear API returned no data.");
  return json.data;
}

export function accessTokenFor(connection: LinearConnection) {
  return decrypt(connection.accessToken);
}

export async function fetchWorkspaceName(accessToken: string) {
  const data = await graphql<{ organization: { name: string } }>(
    accessToken,
    `query { organization { name } }`
  );
  return data.organization.name;
}

export type LinearTeamOption = { id: string; name: string; key: string };

export async function listTeams(accessToken: string) {
  const data = await graphql<{ teams: { nodes: LinearTeamOption[] } }>(
    accessToken,
    `query { teams(first: 100) { nodes { id name key } } }`
  );
  return data.teams.nodes;
}

export type LinearIssue = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  updatedAt: string;
  state: { name: string; type: string };
  assignee: { email: string } | null;
};

const TASK_STATE_MAP: Record<string, "TODO" | "IN_PROGRESS" | "DONE"> = {
  triage: "TODO",
  backlog: "TODO",
  unstarted: "TODO",
  started: "IN_PROGRESS",
  completed: "DONE",
  canceled: "DONE",
};

export function mapLinearStateType(stateType: string) {
  return TASK_STATE_MAP[stateType] ?? "TODO";
}

/** Fetches up to 250 issues for a team, most-recently-updated first. Simple
 * single-page pull — fine for the sync sizes this app deals with; revisit
 * with cursor pagination if a team ever has more open issues than that. */
export async function listTeamIssues(accessToken: string, teamId: string) {
  const data = await graphql<{
    team: { issues: { nodes: LinearIssue[] } };
  }>(
    accessToken,
    `query TeamIssues($teamId: String!) {
      team(id: $teamId) {
        issues(first: 250, orderBy: updatedAt) {
          nodes {
            id
            title
            description
            url
            updatedAt
            state { name type }
            assignee { email }
          }
        }
      }
    }`,
    { teamId }
  );
  return data.team.issues.nodes;
}
