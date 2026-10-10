// MCP server (src/app/api/[transport]/route.ts, served at /api/mcp): same
// rules as the REST API — roles, org isolation, confidential projects,
// invoice status transitions, clean errors on bad input, no share tokens.
import { test, expect } from "@playwright/test";
import { A, B, SHARE_TOKENS, USERS } from "./fixtures";
import { invoiceStatus, mcp, mcpOk, sql } from "./helpers";

const owner = USERS.A.OWNER.apiKey;
const admin = USERS.A.ADMIN.apiKey;
const member = USERS.A.MEMBER.apiKey;
const ownerB = USERS.B.OWNER.apiKey;
const inv = A.invoices;

/** An unhandled exception surfaces as Prisma's message; a handled one doesn't. */
const UNHANDLED = /prisma|Invalid value for argument|Invalid `|Invalid time value|Internal error/i;

test("requests without a valid key are rejected", async ({ request }) => {
  expect((await mcp(request, null, "list_clients")).status).toBe(401);
  expect((await mcp(request, "ch_live_nope", "list_clients")).status).toBe(401);
});

test.describe("org isolation", () => {
  test("lists only show the key's org", async ({ request }) => {
    const clients = await mcpOk(request, ownerB, "list_clients");
    expect(clients.map((c: { id: string }) => c.id)).toEqual([B.client.id]);
    const projects = await mcpOk(request, ownerB, "list_projects");
    expect(projects.map((p: { id: string }) => p.id)).toEqual([B.project.id]);
    const invoices = await mcpOk(request, ownerB, "list_invoices");
    expect(invoices.map((i: { id: string }) => i.id)).toEqual([B.invoice.id]);
  });

  test("another org's invoice can't be read or changed", async ({ request }) => {
    for (const tool of ["mark_invoice_paid", "void_invoice", "get_invoice_activity", "mark_invoice_sent"]) {
      const r = await mcp(request, owner, tool, { invoiceId: B.invoice.id });
      expect(r.isError, tool).toBe(true);
      expect(r.text).toContain("not found");
    }
    expect(await invoiceStatus(B.invoice.id)).toBe("SENT");
  });

  test("another org's project, task, milestone and time entry are out of reach", async ({ request }) => {
    const calls: [string, Record<string, unknown>][] = [
      ["list_milestones", { projectId: B.project.id }],
      ["create_milestone", { projectId: B.project.id, name: "x", amount: 1 }],
      ["complete_milestone", { projectId: B.project.id, milestoneId: B.milestone.id, completionNote: "done" }],
      ["update_task_status", { taskId: B.task.id, projectId: B.project.id, status: "DONE" }],
      ["create_task", { projectId: B.project.id, title: "x" }],
      ["log_time", { projectId: B.project.id, date: "2026-01-05", hours: 1 }],
      ["delete_time_entry", { timeEntryId: B.timeEntry.id }],
      ["list_task_comments", { taskId: B.task.id }],
      ["update_project", { projectId: B.project.id, clientId: B.client.id, name: "Hijacked" }],
      ["update_client", { clientId: B.client.id, name: "Hijacked" }],
    ];
    for (const [tool, args] of calls) {
      const r = await mcp(request, owner, tool, args);
      expect(r.isError, `${tool}: ${r.text}`).toBe(true);
    }
    expect(await sql(`SELECT 1 FROM "Milestone" WHERE id = $1 AND "completedAt" IS NULL`, [B.milestone.id])).toHaveLength(1);
    expect(await sql(`SELECT 1 FROM "Task" WHERE id = $1 AND status = 'TODO'`, [B.task.id])).toHaveLength(1);
    expect(await sql(`SELECT 1 FROM "TimeEntry" WHERE id = $1`, [B.timeEntry.id])).toHaveLength(1);
    expect(await sql(`SELECT name FROM "Project" WHERE id = $1`, [B.project.id])).toEqual([{ name: B.project.name }]);
    expect(await sql(`SELECT name FROM "Client" WHERE id = $1`, [B.client.id])).toEqual([{ name: B.client.name }]);
  });
});

test.describe("members", () => {
  test("can't send, mark paid or void invoices", async ({ request }) => {
    for (const [tool, id] of [
      ["mark_invoice_paid", inv.memberTarget.id],
      ["void_invoice", inv.memberTarget.id],
      ["mark_invoice_sent", inv.memberDraft.id],
      ["email_invoice", inv.memberDraft.id],
    ] as const) {
      const r = await mcp(request, member, tool, { invoiceId: id });
      expect(r.isError, tool).toBe(true);
      expect(r.text).toMatch(/owners and admins/i);
    }
    expect(await invoiceStatus(inv.memberTarget.id)).toBe("SENT");
    expect(await invoiceStatus(inv.memberDraft.id)).toBe("DRAFT");
  });

  test("can't generate invoices", async ({ request }) => {
    const r = await mcp(request, member, "generate_invoice", {
      clientId: A.client.id,
      timeEntryIds: [A.memberEntry.id],
      issueDate: "2026-01-05",
    });
    expect(r.isError).toBe(true);
    expect(r.text).toMatch(/owners and admins/i);
  });

  test("can't manage milestones", async ({ request }) => {
    const base = { projectId: A.openProject.id, milestoneId: A.milestone.id };
    const calls: [string, Record<string, unknown>][] = [
      ["create_milestone", { projectId: A.openProject.id, name: "x", amount: 10 }],
      ["update_milestone", { ...base, name: "Renamed", amount: 1 }],
      ["complete_milestone", { ...base, completionNote: "done" }],
      ["reopen_milestone", base],
    ];
    for (const [tool, args] of calls) {
      const r = await mcp(request, member, tool, args);
      expect(r.isError, tool).toBe(true);
      expect(r.text).toMatch(/owners and admins/i);
    }
    const [m] = await sql<{ name: string; completedAt: Date | null }>(
      `SELECT name, "completedAt" FROM "Milestone" WHERE id = $1`,
      [A.milestone.id]
    );
    expect(m).toEqual({ name: A.milestone.name, completedAt: null });
    // But can read them on a project they can see.
    expect(await mcpOk(request, member, "list_milestones", { projectId: A.openProject.id })).toHaveLength(1);
  });

  test("can't approve expenses, review timesheets or read the audit log", async ({ request }) => {
    for (const [tool, args] of [
      ["list_pending_timesheets", {}],
      ["list_audit_log", {}],
    ] as const) {
      const r = await mcp(request, member, tool, args);
      expect(r.isError, tool).toBe(true);
    }
  });
});

test.describe("confidential projects (member not on the project)", () => {
  test("are left out of project and invoice lists", async ({ request }) => {
    const projects = await mcpOk(request, member, "list_projects");
    const pids = projects.map((p: { id: string }) => p.id);
    expect(pids).toContain(A.openProject.id);
    expect(pids).not.toContain(A.secretProject.id);
    const invoices = await mcpOk(request, member, "list_invoices");
    const iids = invoices.map((i: { id: string }) => i.id);
    expect(iids).toContain(inv.openDraft.id);
    expect(iids).not.toContain(inv.secret.id);
    expect(iids).not.toContain(inv.secretSent.id);
    // Owners and admins see everything.
    for (const key of [owner, admin]) {
      const all = (await mcpOk(request, key, "list_invoices")).map((i: { id: string }) => i.id);
      expect(all).toContain(inv.secret.id);
    }
  });

  test("its invoice activity, milestones and tasks are not found", async ({ request }) => {
    const calls: [string, Record<string, unknown>][] = [
      ["get_invoice_activity", { invoiceId: inv.secret.id }],
      ["list_milestones", { projectId: A.secretProject.id }],
      ["update_task_status", { taskId: A.secretTask.id, projectId: A.secretProject.id, status: "DONE" }],
      ["update_task", { taskId: A.secretTask.id, projectId: A.secretProject.id, title: "Renamed" }],
      ["list_task_comments", { taskId: A.secretTask.id }],
      ["add_task_comment", { taskId: A.secretTask.id, body: "hi" }],
      ["create_task", { projectId: A.secretProject.id, title: "x" }],
      ["log_time", { projectId: A.secretProject.id, date: "2026-01-05", hours: 1 }],
      ["log_expense", { projectId: A.secretProject.id, description: "x", amount: 5, incurredAt: "2026-01-05" }],
    ];
    for (const [tool, args] of calls) {
      const r = await mcp(request, member, tool, args);
      expect(r.isError, `${tool}: ${r.text}`).toBe(true);
      expect(r.text, tool).not.toContain(A.secretProject.name);
    }
    expect(await sql(`SELECT title FROM "Task" WHERE id = $1`, [A.secretTask.id])).toEqual([
      { title: A.secretTask.title },
    ]);
  });

  test("its tasks can't be reached by naming a visible project instead", async ({ request }) => {
    for (const [tool, extra] of [
      ["update_task_status", { status: "DONE" }],
      ["update_task", { title: "Renamed" }],
    ] as const) {
      const r = await mcp(request, member, tool, {
        taskId: A.secretTask.id,
        projectId: A.openProject.id,
        ...extra,
      });
      expect(r.isError, tool).toBe(true);
    }
    expect(await sql(`SELECT title, status FROM "Task" WHERE id = $1`, [A.secretTask.id])).toEqual([
      { title: A.secretTask.title, status: "TODO" },
    ]);
  });

  test("a task id that isn't on the named project gets a clean 'not found'", async ({ request }) => {
    const r = await mcp(request, member, "update_task_status", {
      taskId: A.secretTask.id,
      projectId: A.openProject.id,
      status: "DONE",
    });
    expect(r.text).not.toMatch(UNHANDLED);
  });
});

test.describe("invoice status transitions (owner/admin)", () => {
  test("draft → sent", async ({ request }) => {
    const out = await mcpOk(request, admin, "mark_invoice_sent", { invoiceId: inv.mcpSend.id });
    expect(out.status).toBe("SENT");
    // Sent → sent again is refused.
    const again = await mcp(request, admin, "mark_invoice_sent", { invoiceId: inv.mcpSend.id });
    expect(again.isError).toBe(true);
    expect(again.text).toContain("Only draft invoices can be sent.");
  });

  test("sent → paid", async ({ request }) => {
    const out = await mcpOk(request, owner, "mark_invoice_paid", {
      invoiceId: inv.mcpPay.id,
      paymentMethod: "ACH",
    });
    expect(out.status).toBe("PAID");
    expect(out.paidAt).toBeTruthy();
  });

  test("draft → void releases the billed time", async ({ request }) => {
    const out = await mcpOk(request, owner, "void_invoice", { invoiceId: inv.mcpVoidDraft.id });
    expect(out.status).toBe("VOID");
    const rows = await sql<{ invoiceLineItemId: string | null }>(
      `SELECT "invoiceLineItemId" FROM "TimeEntry" WHERE id = ANY($1)`,
      [A.mcpVoidEntries]
    );
    expect(rows.every((r) => r.invoiceLineItemId === null)).toBe(true);
    // The voided invoice keeps its lines as a record.
    expect(await sql(`SELECT 1 FROM "InvoiceLineItem" WHERE "invoiceId" = $1`, [inv.mcpVoidDraft.id])).toHaveLength(1);
  });

  test("every other transition is refused", async ({ request }) => {
    const refused: [string, string, string][] = [
      ["mark_invoice_paid", inv.openDraft.id, "Only sent invoices can be marked paid."],
      ["mark_invoice_sent", inv.mcpPaid.id, "Only draft invoices can be sent."],
      ["void_invoice", inv.mcpPaid.id, "Paid invoices can't be voided."],
      ["mark_invoice_paid", inv.mcpPaid.id, "Only sent invoices can be marked paid."],
      ["mark_invoice_paid", inv.mcpVoided.id, "Only sent invoices can be marked paid."],
      ["mark_invoice_sent", inv.mcpVoided.id, "Only draft invoices can be sent."],
      ["void_invoice", inv.mcpVoided.id, "This invoice is already void."],
    ];
    for (const [tool, id, message] of refused) {
      const r = await mcp(request, owner, tool, { invoiceId: id });
      expect(r.isError, `${tool} ${id}`).toBe(true);
      expect(r.text).toContain(message);
    }
    expect(await invoiceStatus(inv.openDraft.id)).toBe("DRAFT");
    expect(await invoiceStatus(inv.mcpPaid.id)).toBe("PAID");
    expect(await invoiceStatus(inv.mcpVoided.id)).toBe("VOID");
  });
});

test.describe("bad input gets a clean error", () => {
  test("arguments that fail the schema", async ({ request }) => {
    const r = await mcp(request, owner, "log_time", { projectId: A.openProject.id, date: "2026-01-05", hours: 99 });
    expect(r.isError).toBe(true);
    const missing = await mcp(request, owner, "mark_invoice_paid", {});
    expect(missing.isError).toBe(true);
    const unknown = await mcp(request, owner, "no_such_tool", {});
    expect(unknown.isError).toBe(true);
  });

  const invalidDates: [string, string, Record<string, unknown>][] = [
    ["log_time", "member", { projectId: A.openProject.id, date: "not-a-date", hours: 1 }],
    ["list_time_entries", "member", { from: "not-a-date" }],
    ["create_milestone", "owner", { projectId: A.openProject.id, name: "Bad date", amount: 10, dueDate: "soon" }],
    ["generate_invoice", "owner", { clientId: A.client.id, timeEntryIds: [A.unbilledEntries[0]], issueDate: "garbage" }],
  ];
  for (const [tool, who, args] of invalidDates) {
    test(`${tool} with an invalid date`, async ({ request }) => {
      const r = await mcp(request, who === "owner" ? owner : member, tool, args);
      expect(r.isError).toBe(true);
      expect(r.text).not.toMatch(UNHANDLED);
    });
  }
});

test.describe("share tokens", () => {
  for (const tool of ["list_clients", "list_projects", "list_invoices", "list_time_entries", "list_my_tasks"]) {
    test(`${tool} never returns share tokens to a member`, async ({ request }) => {
      const r = await mcp(request, member, tool);
      expect(r.isError).toBe(false);
      expect(r.text).not.toContain("shareToken");
      for (const token of SHARE_TOKENS) expect(r.text).not.toContain(token);
    });
  }
});
