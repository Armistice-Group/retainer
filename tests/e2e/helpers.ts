import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";
import { expect, type APIRequestContext, type APIResponse, type Page } from "@playwright/test";
import { PASSWORD } from "./fixtures";

/** Logs in through the real login form. */
export async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

// ─── Database (read back what a request actually changed) ────────────────────

let pool: Pool | undefined;

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const { rows } = await pool.query(text, params);
  return rows as T[];
}

export async function invoiceStatus(id: string) {
  const [row] = await sql<{ status: string }>(`SELECT status FROM "Invoice" WHERE id = $1`, [id]);
  return row?.status;
}

export async function exists(table: string, id: string) {
  const rows = await sql(`SELECT 1 FROM "${table}" WHERE id = $1`, [id]);
  return rows.length > 0;
}

// ─── Public REST API ────────────────────────────────────────────────────────

export const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

/** Response body as JSON, failing loudly (with the body) on a 5xx. */
export async function json(res: APIResponse) {
  const body = await res.text();
  expect(res.status(), `server error: ${body.slice(0, 500)}`).toBeLessThan(500);
  return body ? JSON.parse(body) : null;
}

// ─── MCP (streamable HTTP at /api/mcp) ───────────────────────────────────────

export type McpResult = {
  /** JSON-RPC error (protocol level), if any. */
  rpcError?: { code: number; message: string };
  /** Tool result marked isError (permission/validation failure). */
  isError: boolean;
  text: string;
  status: number;
};

let rpcId = 0;

export async function mcp(
  request: APIRequestContext,
  apiKey: string | null,
  tool: string,
  args: Record<string, unknown> = {}
): Promise<McpResult> {
  const res = await request.post("/api/mcp", {
    headers: {
      ...(apiKey ? bearer(apiKey) : {}),
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    data: { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } },
  });
  const raw = await res.text();
  if (res.status() !== 200) return { isError: true, text: raw, status: res.status() };
  // Either a JSON body or an SSE stream with one "data:" line.
  const payload = raw.trim().startsWith("{")
    ? raw
    : raw
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5))
        .join("");
  const msg = JSON.parse(payload);
  if (msg.error) return { rpcError: msg.error, isError: true, text: msg.error.message, status: 200 };
  const text = (msg.result?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
  return { isError: msg.result?.isError === true, text, status: 200 };
}

/** A tool call that must succeed; returns its parsed JSON output. */
export async function mcpOk(request: APIRequestContext, apiKey: string, tool: string, args = {}) {
  const r = await mcp(request, apiKey, tool, args);
  expect(r.isError, `${tool} failed: ${r.text}`).toBe(false);
  return JSON.parse(r.text);
}

// ─── Server actions ─────────────────────────────────────────────────────────
// Calls a server action the way the browser does (POST with a Next-Action
// header), but with whatever session the request context carries — so tests
// can check the server enforces roles even where the UI hides the button.
// Action ids come from the build's server-reference manifest.

type ManifestEntry = { workers: Record<string, { exportedName: string; filename: string }> };
let manifest: Record<string, ManifestEntry> | undefined;

function findAction(file: string, name: string) {
  manifest ??= JSON.parse(
    readFileSync(join(process.cwd(), ".next/server/server-reference-manifest.json"), "utf8")
  ).node as Record<string, ManifestEntry>;
  for (const [id, entry] of Object.entries(manifest)) {
    const workers = Object.entries(entry.workers);
    const match = workers.find(([, w]) => w.exportedName === name && w.filename.endsWith(`src/actions/${file}`));
    if (!match) continue;
    // Post to a page that has the action; fill dynamic segments with "x".
    const page = workers.map(([p]) => p).sort((a, b) => a.split("[").length - b.split("[").length)[0];
    const path =
      page
        .replace(/^app/, "")
        .replace(/\/page$/, "")
        .replace(/\/\([^)]+\)/g, "")
        .replace(/\[[^\]]+\]/g, "x") || "/";
    return { id, path };
  }
  throw new Error(`No server action ${name} in src/actions/${file} (rebuild?)`);
}

/** Invokes a server action with plain JSON-able arguments. Returns the HTTP
 * status; callers check the database for the actual effect. */
export async function callAction(
  request: APIRequestContext,
  file: string,
  name: string,
  args: unknown[]
) {
  const { id, path } = findAction(file, name);
  const res = await request.post(path, {
    headers: {
      "Next-Action": id,
      Accept: "text/x-component",
      "Content-Type": "text/plain;charset=UTF-8",
      Origin: process.env.E2E_BASE_URL!,
    },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  if (res.headers()["x-nextjs-action-not-found"]) {
    throw new Error(`Server action ${name} not found at ${path} (stale build?)`);
  }
  const body = await res.text();
  // A thrown error comes back as a 500 whose RSC payload has an error row.
  const threw = res.status() === 500 && /^\d+:E\{/m.test(body);
  return { status: res.status(), body, threw };
}

/** Calls the action and asserts the server refused it (threw, or returned
 * an `error` state). */
export async function expectRefused(
  request: APIRequestContext,
  file: string,
  name: string,
  args: unknown[]
) {
  const r = await callAction(request, file, name, args);
  const returnedError = r.status === 200 && /"error":"/.test(r.body);
  expect(r.threw || returnedError, `${name}(${JSON.stringify(args)}) was not refused: ${r.status} ${r.body.slice(0, 300)}`).toBe(true);
}
