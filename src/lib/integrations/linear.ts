import "server-only";
import { getConfig, getConfigs, type ConfigKey } from "@/lib/instance-config";
import { encrypt, decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import type { LinearConnection } from "@/generated/prisma/client";

export { signOAuthState, verifyOAuthState } from "@/lib/integrations/oauth-state";

const AUTHORIZE_URL = "https://linear.app/oauth/authorize";
const TOKEN_URL = "https://api.linear.app/oauth/token";
const GRAPHQL_URL = "https://api.linear.app/graphql";
// read: pull teams/projects/labels/issues. write: create issues for tasks
// added in Consultainer and push title/status/assignee edits back.
const SCOPE = "read,write";

export class LinearError extends Error {}

/** Whether this instance has OAuth app credentials for the integration —
 * without them the Connect flow can't start. */
export async function isLinearConfigured() {
  const c = await getConfigs(["LINEAR_CLIENT_ID", "LINEAR_CLIENT_SECRET"]);
  return !!c.LINEAR_CLIENT_ID && !!c.LINEAR_CLIENT_SECRET;
}

// From .env or Settings → Integrations (see lib/instance-config).
async function env(name: ConfigKey) {
  const value = await getConfig(name);
  if (!value) throw new LinearError(`${name} is not configured.`);
  return value;
}

export async function getAuthorizationUrl(state: string, redirectUri: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", await env("LINEAR_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  // Re-show the consent screen so an existing read-only grant gets upgraded.
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export type LinearTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  scope: string | null;
};

async function requestTokens(params: Record<string, string>): Promise<LinearTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: await env("LINEAR_CLIENT_ID"),
      client_secret: await env("LINEAR_CLIENT_SECRET"),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new LinearError(`Linear token request failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string | string[];
    error?: string;
  };
  if (!data.access_token) throw new LinearError(data.error ?? "Linear token request failed.");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: Array.isArray(data.scope) ? data.scope.join(",") : (data.scope ?? null),
  };
}

export function exchangeCodeForToken(code: string, redirectUri: string) {
  return requestTokens({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
}

/** Encrypted columns for persisting a token set on LinearConnection. */
export function tokenColumns(tokens: LinearTokens) {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
    accessTokenExpiresAt: tokens.expiresAt,
    scope: tokens.scope,
  };
}

// Refresh tokens rotate on every use, so two concurrent refreshes would
// invalidate each other — serialize them per connection within the process.
const refreshing = new Map<string, Promise<string>>();

/** A usable access token for the org's connection, refreshing (and storing
 * the rotated tokens) when it's within two minutes of expiring. */
export async function getLinearAccessToken(connection: LinearConnection) {
  const expiresAt = connection.accessTokenExpiresAt?.getTime();
  const fresh = !expiresAt || expiresAt - 2 * 60 * 1000 > Date.now();
  if (fresh || !connection.refreshToken) return decrypt(connection.accessToken);

  let pending = refreshing.get(connection.id);
  if (!pending) {
    pending = (async () => {
      // Another process may already have rotated it — use the latest row.
      const latest = await prisma.linearConnection.findUniqueOrThrow({
        where: { id: connection.id },
      });
      const latestExpiry = latest.accessTokenExpiresAt?.getTime();
      if (latestExpiry && latestExpiry - 2 * 60 * 1000 > Date.now()) {
        return decrypt(latest.accessToken);
      }
      const tokens = await requestTokens({
        grant_type: "refresh_token",
        refresh_token: decrypt(latest.refreshToken!),
      });
      await prisma.linearConnection.update({
        where: { id: connection.id },
        data: tokenColumns({ ...tokens, scope: tokens.scope ?? latest.scope }),
      });
      return tokens.accessToken;
    })().finally(() => refreshing.delete(connection.id));
    refreshing.set(connection.id, pending);
  }
  return pending;
}

/** Older connections were granted read-only access; they need reconnecting
 * before Consultainer can create or update issues. */
export function canWrite(connection: Pick<LinearConnection, "scope">) {
  return !!connection.scope?.split(/[,\s]+/).includes("write");
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

export async function fetchWorkspaceName(accessToken: string) {
  const data = await graphql<{ organization: { name: string } }>(
    accessToken,
    `
      query {
        organization {
          name
        }
      }
    `,
  );
  return data.organization.name;
}

export type LinearTeamOption = { id: string; name: string; key: string };

export async function listTeams(accessToken: string) {
  const data = await graphql<{ teams: { nodes: LinearTeamOption[] } }>(
    accessToken,
    `
      query {
        teams(first: 100) {
          nodes {
            id
            name
            key
          }
        }
      }
    `,
  );
  return data.teams.nodes;
}

export type LinearProjectOption = { id: string; name: string; state: string };
export type LinearLabelOption = { id: string; name: string; color: string };

/** Projects and labels available to filter a team's issues by. Labels
 * include workspace-wide ones (no team) as well as the team's own. */
export async function listTeamFilters(accessToken: string, teamId: string) {
  const data = await graphql<{
    team: { projects: { nodes: LinearProjectOption[] } };
    issueLabels: { nodes: LinearLabelOption[] };
  }>(
    accessToken,
    `
      query TeamFilters($teamId: String!, $teamIdFilter: ID!) {
        team(id: $teamId) {
          projects(first: 100) {
            nodes {
              id
              name
              state
            }
          }
        }
        issueLabels(
          first: 250
          filter: { or: [{ team: { id: { eq: $teamIdFilter } } }, { team: { null: true } }] }
        ) {
          nodes {
            id
            name
            color
          }
        }
      }
    `,
    { teamId, teamIdFilter: teamId },
  );
  return {
    projects: data.team.projects.nodes.filter((p) => p.state !== "canceled"),
    labels: data.issueLabels.nodes.sort((a, b) => a.name.localeCompare(b.name)),
  };
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

export type IssueScope = { teamId: string; projectId?: string | null; labelIds?: string[] };

const MAX_ISSUES = 2000;

/** All issues in a team matching the link's Linear project / labels
 * (at least one of them), following pagination up to MAX_ISSUES. */
export async function listScopedIssues(accessToken: string, scope: IssueScope) {
  const filter: Record<string, unknown> = { team: { id: { eq: scope.teamId } } };
  if (scope.projectId) filter.project = { id: { eq: scope.projectId } };
  if (scope.labelIds?.length) filter.labels = { some: { id: { in: scope.labelIds } } };

  const issues: LinearIssue[] = [];
  let after: string | null = null;
  do {
    const data: {
      issues: {
        nodes: LinearIssue[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await graphql(
      accessToken,
      `
        query ScopedIssues($filter: IssueFilter, $after: String) {
          issues(first: 100, after: $after, filter: $filter, orderBy: updatedAt) {
            nodes {
              id
              title
              description
              url
              updatedAt
              state {
                name
                type
              }
              assignee {
                email
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `,
      { filter, after },
    );
    issues.push(...data.issues.nodes);
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null;
  } while (after && issues.length < MAX_ISSUES);
  return issues;
}

type WorkflowState = { id: string; type: string; position: number };

/** The team workflow state to use for a Consultainer task status: the first
 * (by position) state of the matching type. */
export async function stateIdForStatus(
  accessToken: string,
  teamId: string,
  status: "TODO" | "IN_PROGRESS" | "DONE",
) {
  const data = await graphql<{ team: { states: { nodes: WorkflowState[] } } }>(
    accessToken,
    `
      query TeamStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              type
              position
            }
          }
        }
      }
    `,
    { teamId },
  );
  const wanted = { TODO: "unstarted", IN_PROGRESS: "started", DONE: "completed" }[status];
  return (
    data.team.states.nodes
      .filter((s) => s.type === wanted)
      .sort((a, b) => a.position - b.position)[0]?.id ?? null
  );
}

/** Linear user for a Consultainer member, matched by email. */
export async function findUserIdByEmail(accessToken: string, email: string) {
  const data = await graphql<{ users: { nodes: { id: string }[] } }>(
    accessToken,
    `
      query UserByEmail($email: String!) {
        users(filter: { email: { eqIgnoreCase: $email } }) {
          nodes {
            id
          }
        }
      }
    `,
    { email },
  );
  return data.users.nodes[0]?.id ?? null;
}

export type IssueFields = {
  title?: string;
  description?: string | null;
  stateId?: string | null;
  assigneeId?: string | null;
};

export async function createIssue(
  accessToken: string,
  scope: IssueScope,
  fields: IssueFields & { title: string },
) {
  const data = await graphql<{
    issueCreate: { success: boolean; issue: { id: string; url: string } | null };
  }>(
    accessToken,
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            url
          }
        }
      }
    `,
    {
      input: {
        teamId: scope.teamId,
        projectId: scope.projectId ?? undefined,
        labelIds: scope.labelIds?.length ? scope.labelIds : undefined,
        title: fields.title,
        description: fields.description ?? undefined,
        stateId: fields.stateId ?? undefined,
        assigneeId: fields.assigneeId ?? undefined,
      },
    },
  );
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new LinearError("Linear didn't create the issue.");
  }
  return data.issueCreate.issue;
}

export async function updateIssue(accessToken: string, issueId: string, fields: IssueFields) {
  const input = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  if (Object.keys(input).length === 0) return;
  await graphql(
    accessToken,
    `
      mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
        }
      }
    `,
    { id: issueId, input },
  );
}

export async function createComment(accessToken: string, issueId: string, body: string) {
  const data = await graphql<{
    commentCreate: { success: boolean; comment: { id: string; url: string } | null };
  }>(
    accessToken,
    `
      mutation CreateComment($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            url
          }
        }
      }
    `,
    { input: { issueId, body } },
  );
  if (!data.commentCreate.success || !data.commentCreate.comment) {
    throw new LinearError("Linear didn't create the comment.");
  }
  return data.commentCreate.comment;
}
