// Public REST API (src/app/api/v1/**): API-key auth, roles, org isolation,
// confidential projects, input validation (422, never 500) and share tokens.
import { test, expect } from "@playwright/test";
import { A, B, ORG, SHARE_TOKENS, USERS } from "./fixtures";
import { bearer, json, sql } from "./helpers";

const ownerA = bearer(USERS.A.OWNER.apiKey);
const adminA = bearer(USERS.A.ADMIN.apiKey);
const memberA = bearer(USERS.A.MEMBER.apiKey);
const ownerB = bearer(USERS.B.OWNER.apiKey);

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

test.describe("authentication", () => {
  for (const path of ["/api/v1/clients", "/api/v1/projects", "/api/v1/invoices", "/api/v1/time-entries"]) {
    test(`${path} needs a valid key`, async ({ request }) => {
      expect((await request.get(path)).status()).toBe(401);
      expect((await request.get(path, { headers: bearer("ch_live_not-a-real-key") })).status()).toBe(401);
      expect((await request.get(path, { headers: { Authorization: "Basic abc" } })).status()).toBe(401);
    });
  }

  test("a revoked key stops working", async ({ request }) => {
    await sql(`UPDATE "ApiKey" SET "revokedAt" = now() WHERE "userId" = $1`, [USERS.B.ADMIN.id]);
    const res = await request.get("/api/v1/clients", { headers: bearer(USERS.B.ADMIN.apiKey) });
    expect(res.status()).toBe(401);
  });
});

test.describe("org isolation", () => {
  test("each key only lists its own org's clients, projects and invoices", async ({ request }) => {
    const clientsA = ids((await json(await request.get("/api/v1/clients", { headers: ownerA }))).clients);
    const clientsB = ids((await json(await request.get("/api/v1/clients", { headers: ownerB }))).clients);
    expect(clientsA).toContain(A.client.id);
    expect(clientsA).not.toContain(B.client.id);
    expect(clientsB).toEqual([B.client.id]);

    const projectsB = ids((await json(await request.get("/api/v1/projects", { headers: ownerB }))).projects);
    expect(projectsB).toEqual([B.project.id]);
    // Filtering by another org's client id returns nothing, not their projects.
    const crossFilter = await json(
      await request.get(`/api/v1/projects?clientId=${B.client.id}`, { headers: ownerA })
    );
    expect(crossFilter.projects).toEqual([]);

    const invoicesB = ids((await json(await request.get("/api/v1/invoices", { headers: ownerB }))).invoices);
    expect(invoicesB).toEqual([B.invoice.id]);
    const invoicesA = ids((await json(await request.get("/api/v1/invoices", { headers: ownerA }))).invoices);
    expect(invoicesA).not.toContain(B.invoice.id);
  });

  test("another org's project tasks are not found", async ({ request }) => {
    expect((await request.get(`/api/v1/projects/${B.project.id}/tasks`, { headers: ownerA })).status()).toBe(404);
    const create = await request.post(`/api/v1/projects/${B.project.id}/tasks`, {
      headers: ownerA,
      data: { title: "Sneaky task" },
    });
    expect(create.status()).toBe(404);
  });

  test("another org's task can't be changed, deleted or commented on", async ({ request }) => {
    const patch = await request.patch(`/api/v1/tasks/${B.task.id}`, { headers: ownerA, data: { status: "DONE" } });
    expect(patch.status()).toBe(404);
    expect((await request.delete(`/api/v1/tasks/${B.task.id}`, { headers: ownerA })).status()).toBe(404);
    const comment = await request.post(`/api/v1/tasks/${B.task.id}/comments`, {
      headers: ownerA,
      data: { body: "hello" },
    });
    expect(comment.status()).toBe(404);
    expect((await request.get(`/api/v1/tasks/${B.task.id}/comments`, { headers: ownerA })).status()).toBe(404);
    const [task] = await sql<{ status: string }>(`SELECT status FROM "Task" WHERE id = $1`, [B.task.id]);
    expect(task.status).toBe("TODO");
  });

  test("another org's time entry can't be changed or deleted", async ({ request }) => {
    const patch = await request.patch(`/api/v1/time-entries/${B.timeEntry.id}`, {
      headers: ownerA,
      data: { projectId: A.openProject.id, date: "2026-01-05", hours: 9 },
    });
    expect(patch.status()).toBe(422);
    expect((await request.delete(`/api/v1/time-entries/${B.timeEntry.id}`, { headers: ownerA })).status()).toBe(422);
    const [entry] = await sql<{ hours: string; orgId: string }>(
      `SELECT hours::text, "orgId" FROM "TimeEntry" WHERE id = $1`,
      [B.timeEntry.id]
    );
    expect(entry).toEqual({ hours: "1.00", orgId: ORG.B.id });
  });

  test("time can't be logged on another org's project or for another org's person", async ({ request }) => {
    const onB = await request.post("/api/v1/time-entries", {
      headers: ownerA,
      data: { projectId: B.project.id, date: "2026-01-05", hours: 1 },
    });
    expect(onB.status()).toBe(422);
    const forB = await request.post("/api/v1/time-entries", {
      headers: ownerA,
      data: { projectId: A.openProject.id, date: "2026-01-05", hours: 1, userId: USERS.B.MEMBER.id },
    });
    expect(forB.status()).toBe(422);
  });

  test("invoices can't be generated for another org's client or work", async ({ request }) => {
    const res = await request.post("/api/v1/invoices/generate", {
      headers: ownerA,
      data: { clientId: B.client.id, timeEntryIds: [B.timeEntry.id], issueDate: "2026-01-05" },
    });
    expect(res.status()).toBe(422);
    const mixed = await request.post("/api/v1/invoices/generate", {
      headers: ownerA,
      data: { clientId: A.client.id, timeEntryIds: [B.timeEntry.id], issueDate: "2026-01-05" },
    });
    expect(mixed.status()).toBe(422);
  });

  test("the audit log only shows the key's own org", async ({ request }) => {
    const res = await json(await request.get("/api/v1/audit-log?limit=200", { headers: ownerB }));
    const rows = await sql<{ id: string }>(`SELECT id FROM "AuditLog" WHERE "orgId" <> 'e2e_org_b'`);
    const foreign = new Set(rows.map((r) => r.id));
    expect(res.entries.filter((e: { id: string }) => foreign.has(e.id))).toEqual([]);
  });
});

test.describe("roles", () => {
  test("members can't generate invoices", async ({ request }) => {
    const res = await request.post("/api/v1/invoices/generate", {
      headers: memberA,
      data: { clientId: A.client.id, timeEntryIds: [A.memberEntry.id], issueDate: "2026-01-05" },
    });
    expect(res.status()).toBe(403);
    const [entry] = await sql<{ invoiceLineItemId: string | null }>(
      `SELECT "invoiceLineItemId" FROM "TimeEntry" WHERE id = $1`,
      [A.memberEntry.id]
    );
    expect(entry.invoiceLineItemId).toBeNull();
  });

  test("members can't read the audit log; owners and admins can", async ({ request }) => {
    expect((await request.get("/api/v1/audit-log", { headers: memberA })).status()).toBe(403);
    expect((await request.get("/api/v1/audit-log", { headers: adminA })).status()).toBe(200);
    expect((await request.get("/api/v1/audit-log", { headers: ownerA })).status()).toBe(200);
  });

  test("a member only sees their own time, even when asking for someone else's", async ({ request }) => {
    const res = await json(
      await request.get(`/api/v1/time-entries?userId=${USERS.A.OWNER.id}`, { headers: memberA })
    );
    const users = new Set(res.timeEntries.map((e: { userId: string }) => e.userId));
    expect([...users]).toEqual([USERS.A.MEMBER.id]);
  });

  test("a member can't log time for someone else", async ({ request }) => {
    const res = await request.post("/api/v1/time-entries", {
      headers: memberA,
      data: { projectId: A.openProject.id, date: "2026-01-06", hours: 1, userId: USERS.A.OWNER.id },
    });
    const body = await json(res);
    // userId is ignored for members: the entry is theirs.
    expect(res.status()).toBe(201);
    expect(body.timeEntry.userId).toBe(USERS.A.MEMBER.id);
    await request.delete(`/api/v1/time-entries/${body.timeEntry.id}`, { headers: memberA });
  });

  test("a member can't edit or delete someone else's time entry", async ({ request }) => {
    const patch = await request.patch(`/api/v1/time-entries/${A.unbilledEntries[0]}`, {
      headers: memberA,
      data: { projectId: A.openProject.id, date: "2026-01-05", hours: 7 },
    });
    expect(patch.status()).toBe(422);
    const del = await request.delete(`/api/v1/time-entries/${A.unbilledEntries[0]}`, { headers: memberA });
    expect(del.status()).toBe(422);
    const [entry] = await sql<{ hours: string }>(`SELECT hours::text FROM "TimeEntry" WHERE id = $1`, [
      A.unbilledEntries[0],
    ]);
    expect(entry.hours).toBe("2.00");
  });
});

test.describe("confidential projects", () => {
  test("members don't see a confidential project they aren't on", async ({ request }) => {
    const member = ids((await json(await request.get("/api/v1/projects", { headers: memberA }))).projects);
    expect(member).toContain(A.openProject.id);
    expect(member).not.toContain(A.secretProject.id);
    for (const headers of [ownerA, adminA]) {
      const all = ids((await json(await request.get("/api/v1/projects", { headers }))).projects);
      expect(all).toContain(A.secretProject.id);
    }
  });

  test("members don't see invoices with a line on that project", async ({ request }) => {
    const member = ids((await json(await request.get("/api/v1/invoices", { headers: memberA }))).invoices);
    expect(member).toContain(A.invoices.openDraft.id);
    expect(member).not.toContain(A.invoices.secret.id);
    expect(member).not.toContain(A.invoices.secretSent.id);
    const sent = ids((await json(await request.get("/api/v1/invoices?status=SENT", { headers: memberA }))).invoices);
    expect(sent).not.toContain(A.invoices.secret.id);
    const owner = ids((await json(await request.get("/api/v1/invoices", { headers: ownerA }))).invoices);
    expect(owner).toContain(A.invoices.secret.id);
  });

  test("members can't read or add tasks on it", async ({ request }) => {
    const path = `/api/v1/projects/${A.secretProject.id}/tasks`;
    expect((await request.get(path, { headers: memberA })).status()).toBe(404);
    expect((await request.post(path, { headers: memberA, data: { title: "x" } })).status()).toBe(404);
    expect((await request.get(path, { headers: ownerA })).status()).toBe(200);
  });

  test("members can't change, delete or comment on its tasks", async ({ request }) => {
    const task = `/api/v1/tasks/${A.secretTask.id}`;
    expect((await request.patch(task, { headers: memberA, data: { status: "DONE" } })).status()).toBe(404);
    expect((await request.delete(task, { headers: memberA })).status()).toBe(404);
    expect((await request.get(`${task}/comments`, { headers: memberA })).status()).toBe(404);
    expect((await request.post(`${task}/comments`, { headers: memberA, data: { body: "hi" } })).status()).toBe(404);
    expect(
      await sql(`SELECT 1 FROM "Task" WHERE id = $1 AND status = 'TODO'`, [A.secretTask.id])
    ).toHaveLength(1);
  });

  test("members can't log time on it or assign its tasks to a member who isn't on it", async ({ request }) => {
    const res = await request.post("/api/v1/time-entries", {
      headers: memberA,
      data: { projectId: A.secretProject.id, date: "2026-01-05", hours: 1 },
    });
    expect(res.status()).toBe(422);
    const assign = await request.patch(`/api/v1/tasks/${A.secretTask.id}`, {
      headers: ownerA,
      data: { assigneeId: USERS.A.MEMBER.id },
    });
    expect(assign.status()).toBe(422);
  });
});

test.describe("validation returns 422, not 500", () => {
  test("bad JSON and missing fields", async ({ request }) => {
    const bad = await request.post("/api/v1/clients", {
      headers: { ...ownerA, "Content-Type": "application/json" },
      data: "{not json",
    });
    expect(bad.status()).toBe(422);
    expect((await request.post("/api/v1/clients", { headers: ownerA, data: {} })).status()).toBe(422);
    expect((await request.post("/api/v1/time-entries", { headers: ownerA, data: {} })).status()).toBe(422);
    const hours = await request.post("/api/v1/time-entries", {
      headers: ownerA,
      data: { projectId: A.openProject.id, date: "2026-01-05", hours: 30 },
    });
    expect(hours.status()).toBe(422);
    expect((await request.post("/api/v1/invoices/generate", { headers: ownerA, data: {} })).status()).toBe(422);
    const status = await request.patch(`/api/v1/tasks/${A.openTask.id}`, {
      headers: ownerA,
      data: { status: "FINISHED" },
    });
    expect(status.status()).toBe(422);
    const assignee = await request.patch(`/api/v1/tasks/${A.openTask.id}`, {
      headers: ownerA,
      data: { assigneeId: 42 },
    });
    expect(assignee.status()).toBe(422);
  });

  test("invalid date filters on GET /time-entries", async ({ request }) => {
    expect((await request.get("/api/v1/time-entries?from=not-a-date", { headers: ownerA })).status()).toBe(422);
    expect((await request.get("/api/v1/time-entries?to=2026-13-45", { headers: ownerA })).status()).toBe(422);
  });

  test("invalid date when logging time", async ({ request }) => {
    const res = await request.post("/api/v1/time-entries", {
      headers: memberA,
      data: { projectId: A.openProject.id, date: "not-a-date", hours: 1 },
    });
    expect(res.status()).toBe(422);
  });

  test("invalid date when editing time", async ({ request }) => {
    const res = await request.patch(`/api/v1/time-entries/${A.memberEntry.id}`, {
      headers: memberA,
      data: { projectId: A.openProject.id, date: "31/02/2026", hours: 1 },
    });
    expect(res.status()).toBe(422);
  });

  test("invalid dates when generating an invoice", async ({ request }) => {
    const res = await request.post("/api/v1/invoices/generate", {
      headers: ownerA,
      data: { clientId: A.client.id, timeEntryIds: [A.unbilledEntries[0]], issueDate: "garbage" },
    });
    expect(res.status()).toBe(422);
  });
});

test.describe("share tokens", () => {
  const memberEndpoints = [
    "/api/v1/clients",
    "/api/v1/projects",
    "/api/v1/invoices",
    `/api/v1/projects/${A.openProject.id}/tasks`,
  ];
  for (const path of memberEndpoints) {
    test(`a member's key never gets share tokens from ${path}`, async ({ request }) => {
      const body = await (await request.get(path, { headers: memberA })).text();
      expect(body).not.toContain("shareToken");
      for (const token of SHARE_TOKENS) expect(body).not.toContain(token);
    });
  }

  test("a member's key never gets share tokens from /api/v1/time-entries", async ({ request }) => {
    const body = await (await request.get("/api/v1/time-entries", { headers: memberA })).text();
    for (const token of SHARE_TOKENS) expect(body).not.toContain(token);
  });

  test("creating a client with a member key doesn't return a share token field", async ({ request }) => {
    const res = await request.post("/api/v1/clients", { headers: memberA, data: { name: "Member-made client" } });
    expect(res.status()).toBe(201);
    expect(await res.text()).not.toContain("shareToken");
  });

  test("owner and admin keys do get share tokens (they manage share links)", async ({ request }) => {
    for (const headers of [ownerA, adminA]) {
      const { clients } = await json(await request.get("/api/v1/clients", { headers }));
      const client = clients.find((c: { id: string }) => c.id === A.client.id);
      expect(client.shareToken).toBe(A.client.shareToken);
    }
  });
});

test("an owner can generate an invoice from unbilled time", async ({ request }) => {
  const res = await request.post("/api/v1/invoices/generate", {
    headers: ownerA,
    data: { clientId: A.client.id, timeEntryIds: [A.unbilledEntries[1]], issueDate: "2026-01-05" },
  });
  const body = await json(res);
  expect(res.status()).toBe(201);
  expect(body.invoice.status).toBe("DRAFT");
  const [entry] = await sql<{ invoiceLineItemId: string | null }>(
    `SELECT "invoiceLineItemId" FROM "TimeEntry" WHERE id = $1`,
    [A.unbilledEntries[1]]
  );
  expect(entry.invoiceLineItemId).not.toBeNull();
});
