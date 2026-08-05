import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { authenticateApiRequest, type ApiAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere } from "@/lib/project-access";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  TimeEntryError,
} from "@/lib/services/time-entries";
import { generateInvoice, InvoiceError } from "@/lib/services/invoices";

function text(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function ctxFrom(extra: RequestHandlerExtra<never, never>): ApiAuthContext {
  const ctx = extra.authInfo?.extra?.ctx as ApiAuthContext | undefined;
  if (!ctx) throw new Error("Missing authentication context.");
  return ctx;
}

function timeEntryContext(ctx: ApiAuthContext) {
  return {
    orgId: ctx.orgId,
    slackWebhookUrl: ctx.slackWebhookUrl,
    actorId: ctx.actorId,
    actorName: ctx.actorName,
    role: ctx.role,
  };
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "list_clients",
      "List all clients in the current organization.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const clients = await prisma.client.findMany({
          where: { orgId: ctx.orgId },
          orderBy: { name: "asc" },
        });
        return text(clients);
      }
    );

    server.tool(
      "list_projects",
      "List projects, optionally filtered by client id.",
      { clientId: z.string().optional() },
      async ({ clientId }, extra) => {
        const ctx = ctxFrom(extra);
        const projects = await prisma.project.findMany({
          where: {
            orgId: ctx.orgId,
            ...(clientId ? { clientId } : {}),
            ...projectVisibilityWhere(ctx.actorId, ctx.role),
          },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(projects);
      }
    );

    server.tool(
      "list_my_tasks",
      "List open (not-done) tasks assigned to the authenticated user.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const tasks = await prisma.task.findMany({
          where: { assigneeId: ctx.actorId, status: { not: "DONE" }, project: { orgId: ctx.orgId } },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(tasks);
      }
    );

    server.tool(
      "log_time",
      "Log time against a project for the authenticated user.",
      {
        projectId: z.string(),
        date: z.string().describe("ISO date, e.g. 2026-07-23"),
        hours: z.number().positive().max(24),
        description: z.string().optional(),
        billable: z.boolean().default(true),
        taskId: z.string().optional(),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        try {
          const entry = await createTimeEntry(timeEntryContext(ctx), args);
          return text(entry);
        } catch (err) {
          if (err instanceof TimeEntryError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_time_entries",
      "List the authenticated user's logged time entries, optionally filtered.",
      {
        from: z.string().optional().describe("ISO date, inclusive lower bound"),
        to: z.string().optional().describe("ISO date, inclusive upper bound"),
        projectId: z.string().optional(),
      },
      async ({ from, to, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        const entries = await prisma.timeEntry.findMany({
          where: {
            orgId: ctx.orgId,
            userId: ctx.actorId,
            ...(projectId ? { projectId } : {}),
            ...(from || to
              ? {
                  date: {
                    ...(from ? { gte: new Date(from) } : {}),
                    ...(to ? { lte: new Date(to) } : {}),
                  },
                }
              : {}),
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { date: "desc" },
        });
        return text(entries);
      }
    );

    server.tool(
      "update_time_entry",
      "Update one of the authenticated user's time entries (must not be invoiced yet).",
      {
        timeEntryId: z.string(),
        projectId: z.string(),
        date: z.string(),
        hours: z.number().positive().max(24),
        description: z.string().optional(),
        billable: z.boolean().default(true),
        taskId: z.string().optional(),
      },
      async ({ timeEntryId, ...rest }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          const entry = await updateTimeEntry(timeEntryContext(ctx), timeEntryId, rest);
          return text(entry);
        } catch (err) {
          if (err instanceof TimeEntryError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "delete_time_entry",
      "Delete one of the authenticated user's time entries (must not be invoiced yet).",
      { timeEntryId: z.string() },
      async ({ timeEntryId }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          await deleteTimeEntry(timeEntryContext(ctx), timeEntryId);
          return text({ ok: true });
        } catch (err) {
          if (err instanceof TimeEntryError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_invoices",
      "List invoices in the current organization, optionally filtered by status.",
      { status: z.enum(["DRAFT", "SENT", "PAID", "VOID"]).optional() },
      async ({ status }, extra) => {
        const ctx = ctxFrom(extra);
        const invoices = await prisma.invoice.findMany({
          where: { orgId: ctx.orgId, ...(status ? { status } : {}) },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(invoices);
      }
    );

    server.tool(
      "generate_invoice",
      "Generate a draft invoice from unbilled, billable time entries, completed unbilled milestones, and/or approved unbilled expenses. Owner/admin only.",
      {
        clientId: z.string(),
        timeEntryIds: z.array(z.string()).default([]),
        milestoneIds: z.array(z.string()).default([]),
        expenseIds: z.array(z.string()).default([]),
        issueDate: z.string(),
        dueDate: z.string(),
        taxRate: z.number().min(0).max(100).default(0),
        notes: z.string().optional(),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can generate invoices.");
        }
        if (
          args.timeEntryIds.length === 0 &&
          args.milestoneIds.length === 0 &&
          args.expenseIds.length === 0
        ) {
          return errorResult("Provide at least one timeEntryId, milestoneId, or expenseId.");
        }
        try {
          const invoice = await generateInvoice(
            { orgId: ctx.orgId, defaultCurrency: ctx.defaultCurrency, actorId: ctx.actorId, role: ctx.role },
            args
          );
          return text(invoice);
        } catch (err) {
          if (err instanceof InvoiceError) return errorResult(err.message);
          throw err;
        }
      }
    );
  },
  { serverInfo: { name: "consulthub", version: "1.0.0" } },
  { basePath: "/api" }
);

const authedHandler = withMcpAuth(
  handler,
  async (req) => {
    const ctx = await authenticateApiRequest(req);
    if (!ctx) return undefined;
    return { token: "api-key", clientId: ctx.actorId, scopes: [], extra: { ctx } };
  },
  { required: true }
);

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE };
