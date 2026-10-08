import { z } from "zod";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { authenticateApiRequest, type ApiAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere, canViewProject } from "@/lib/project-access";
import { taskStatusValues } from "@/lib/validations/task";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  TimeEntryError,
} from "@/lib/services/time-entries";
import { generateInvoice, notifyInvoiceStatusChange, InvoiceError } from "@/lib/services/invoices";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import { soloMemberId } from "@/lib/org";
import { pushTaskToLinear } from "@/lib/services/linear-sync";

const clientStatusValues = ["ACTIVE", "INACTIVE"] as const;
const projectStatusValues = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
const billingTypeValues = ["HOURLY", "FLAT_FEE", "MILESTONE"] as const;
const expenseCategoryDescription =
  "Free-text category, e.g. Travel, Software, Materials.";

async function requireProjectForActor(
  projectId: string,
  ctx: ApiAuthContext
): Promise<{ id: string; orgId: string; confidential: boolean; name: string } | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.orgId !== ctx.orgId) return null;
  if (!(await canViewProject(project, ctx.actorId, ctx.role))) return null;
  return project;
}

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
      "create_client",
      "Create a new client in the current organization.",
      {
        name: z.string().min(1).max(200),
        website: z.string().max(300).optional(),
        description: z.string().max(2000).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        address: z.string().max(500).optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().max(500).optional(),
        status: z.enum(clientStatusValues).default("ACTIVE"),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        const client = await prisma.client.create({
          data: { orgId: ctx.orgId, ...args },
        });
        return text(client);
      }
    );

    server.tool(
      "update_client",
      "Update an existing client's details.",
      {
        clientId: z.string(),
        name: z.string().min(1).max(200),
        website: z.string().max(300).optional(),
        description: z.string().max(2000).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(50).optional(),
        address: z.string().max(500).optional(),
        billingEmail: z.string().email().optional(),
        billingAddress: z.string().max(500).optional(),
        status: z.enum(clientStatusValues).default("ACTIVE"),
      },
      async ({ clientId, ...rest }, extra) => {
        const ctx = ctxFrom(extra);
        const existing = await prisma.client.findUnique({ where: { id: clientId } });
        if (!existing || existing.orgId !== ctx.orgId) return errorResult("Client not found.");
        const client = await prisma.client.update({
          where: { id: clientId },
          data: rest,
        });
        return text(client);
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
      "create_project",
      "Create a new project for a client.",
      {
        clientId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        status: z.enum(projectStatusValues).default("ACTIVE"),
        startDate: z.string().optional().describe("ISO date"),
        endDate: z.string().optional().describe("ISO date"),
        confidential: z.boolean().default(false),
        budgetHours: z.number().positive().optional(),
        billingType: z.enum(billingTypeValues).default("HOURLY"),
        flatFeeAmount: z.number().positive().optional(),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        const client = await prisma.client.findUnique({ where: { id: args.clientId } });
        if (!client || client.orgId !== ctx.orgId) return errorResult("Client not found.");

        const project = await prisma.project.create({
          data: {
            orgId: ctx.orgId,
            clientId: args.clientId,
            name: args.name,
            description: args.description ?? null,
            status: args.status,
            startDate: args.startDate ? new Date(args.startDate) : null,
            endDate: args.endDate ? new Date(args.endDate) : null,
            confidential: args.confidential,
            budgetHours: args.budgetHours ?? null,
            billingType: args.billingType,
            flatFeeAmount: args.billingType === "FLAT_FEE" ? (args.flatFeeAmount ?? null) : null,
          },
        });

        // Same rule the web UI follows: a solo org has no one else to add, and a
        // non-admin creator of a confidential project must stay able to see it
        // (visibility is need-to-know via ProjectMember).
        const memberCount = await prisma.membership.count({ where: { orgId: ctx.orgId } });
        const soloOrg = memberCount === 1;
        const nonAdminConfidentialCreator =
          args.confidential && ctx.role !== "OWNER" && ctx.role !== "ADMIN";
        if (soloOrg || nonAdminConfidentialCreator) {
          await prisma.projectMember.create({
            data: {
              projectId: project.id,
              userId: ctx.actorId,
              billRate: 0,
              currency: ctx.defaultCurrency,
            },
          });
        }

        return text(project);
      }
    );

    server.tool(
      "update_project",
      "Update an existing project's details.",
      {
        projectId: z.string(),
        clientId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        status: z.enum(projectStatusValues).default("ACTIVE"),
        startDate: z.string().optional().describe("ISO date"),
        endDate: z.string().optional().describe("ISO date"),
        confidential: z.boolean().default(false),
        budgetHours: z.number().positive().optional(),
        billingType: z.enum(billingTypeValues).default("HOURLY"),
        flatFeeAmount: z.number().positive().optional(),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const existing = await requireProjectForActor(projectId, ctx);
        if (!existing) return errorResult("Project not found.");

        const client = await prisma.client.findUnique({ where: { id: args.clientId } });
        if (!client || client.orgId !== ctx.orgId) return errorResult("Client not found.");

        const project = await prisma.project.update({
          where: { id: projectId },
          data: {
            clientId: args.clientId,
            name: args.name,
            description: args.description ?? null,
            status: args.status,
            startDate: args.startDate ? new Date(args.startDate) : null,
            endDate: args.endDate ? new Date(args.endDate) : null,
            confidential: args.confidential,
            budgetHours: args.budgetHours ?? null,
            billingType: args.billingType,
            flatFeeAmount: args.billingType === "FLAT_FEE" ? (args.flatFeeAmount ?? null) : null,
          },
        });

        if (args.confidential && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          await prisma.projectMember.upsert({
            where: { projectId_userId: { projectId, userId: ctx.actorId } },
            create: {
              projectId,
              userId: ctx.actorId,
              billRate: 0,
              currency: ctx.defaultCurrency,
            },
            update: {},
          });
        }

        return text(project);
      }
    );

    server.tool(
      "list_my_tasks",
      "List open (not-done) tasks assigned to the authenticated user, optionally filtered to one project.",
      { projectId: z.string().optional() },
      async ({ projectId }, extra) => {
        const ctx = ctxFrom(extra);
        const tasks = await prisma.task.findMany({
          where: {
            assigneeId: ctx.actorId,
            status: { not: "DONE" },
            project: { orgId: ctx.orgId },
            ...(projectId ? { projectId } : {}),
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(tasks);
      }
    );

    server.tool(
      "update_task_status",
      "Update a task's status to TODO, IN_PROGRESS, or DONE.",
      {
        taskId: z.string(),
        projectId: z.string(),
        status: z.enum(taskStatusValues),
      },
      async ({ taskId, projectId, status }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project || project.orgId !== ctx.orgId) return errorResult("Project not found.");
        if (!(await canViewProject(project, ctx.actorId, ctx.role))) {
          return errorResult("Project not found.");
        }
        const task = await prisma.task.update({
          where: { id: taskId, projectId },
          data: { status },
        });
        await pushTaskToLinear(task.id);
        return text(task);
      }
    );

    server.tool(
      "create_task",
      "Create a new task on a project.",
      {
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        assigneeId: z.string().optional(),
        estimatedHours: z.number().positive().optional(),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const task = await prisma.task.create({
          data: {
            projectId,
            title: args.title,
            description: args.description ?? null,
            assigneeId: args.assigneeId || (await soloMemberId(ctx.orgId)),
            estimatedHours: args.estimatedHours ?? null,
          },
        });
        await pushTaskToLinear(task.id);
        return text(task);
      }
    );

    server.tool(
      "update_task",
      "Update a task's title, description, or hour estimate (not its status or assignee — see update_task_status).",
      {
        taskId: z.string(),
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        estimatedHours: z.number().positive().optional(),
      },
      async ({ taskId, projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const task = await prisma.task.update({
          where: { id: taskId, projectId },
          data: {
            title: args.title,
            description: args.description ?? null,
            estimatedHours: args.estimatedHours ?? null,
          },
        });
        await pushTaskToLinear(task.id);
        return text(task);
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
      "list_milestones",
      "List fixed-price milestones for a project.",
      { projectId: z.string() },
      async ({ projectId }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");
        const milestones = await prisma.milestone.findMany({
          where: { projectId },
          orderBy: { sortOrder: "asc" },
        });
        return text(milestones);
      }
    );

    server.tool(
      "create_milestone",
      "Create a fixed-price milestone on a project.",
      {
        projectId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        amount: z.number().positive(),
        dueDate: z.string().optional().describe("ISO date"),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const count = await prisma.milestone.count({ where: { projectId } });
        const milestone = await prisma.milestone.create({
          data: {
            projectId,
            name: args.name,
            description: args.description ?? null,
            amount: args.amount,
            dueDate: args.dueDate ? new Date(args.dueDate) : null,
            sortOrder: count,
          },
        });
        return text(milestone);
      }
    );

    server.tool(
      "update_milestone",
      "Update a milestone's name, description, amount, or due date (not yet invoiced).",
      {
        milestoneId: z.string(),
        projectId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        amount: z.number().positive(),
        dueDate: z.string().optional().describe("ISO date"),
      },
      async ({ milestoneId, projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
        if (!milestone || milestone.projectId !== projectId) {
          return errorResult("Milestone not found.");
        }
        if (milestone.invoicedAt) {
          return errorResult("This milestone has already been invoiced and can't be edited.");
        }

        const updated = await prisma.milestone.update({
          where: { id: milestoneId },
          data: {
            name: args.name,
            description: args.description ?? null,
            amount: args.amount,
            dueDate: args.dueDate ? new Date(args.dueDate) : null,
          },
        });
        return text(updated);
      }
    );

    server.tool(
      "complete_milestone",
      "Mark a milestone complete with a note describing what was delivered (evidence file uploads aren't supported over MCP — use the web app for those).",
      {
        milestoneId: z.string(),
        projectId: z.string(),
        completionNote: z.string().min(1).max(2000),
        completionUrl: z.string().url().optional(),
      },
      async ({ milestoneId, projectId, completionNote, completionUrl }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
        if (!milestone || milestone.projectId !== projectId) {
          return errorResult("Milestone not found.");
        }
        if (milestone.completedAt) return errorResult("This milestone is already marked complete.");

        const updated = await prisma.milestone.update({
          where: { id: milestoneId },
          data: {
            completedAt: new Date(),
            completedById: ctx.actorId,
            completionNote,
            completionUrl: completionUrl ?? null,
          },
        });
        return text(updated);
      }
    );

    server.tool(
      "reopen_milestone",
      "Clear a milestone's completion (not yet invoiced).",
      { milestoneId: z.string(), projectId: z.string() },
      async ({ milestoneId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
        if (!milestone || milestone.projectId !== projectId) {
          return errorResult("Milestone not found.");
        }
        if (milestone.invoicedAt) return errorResult("This milestone has already been invoiced.");

        const updated = await prisma.milestone.update({
          where: { id: milestoneId },
          data: {
            completedAt: null,
            completedById: null,
            completionNote: null,
            completionUrl: null,
          },
        });
        return text(updated);
      }
    );

    server.tool(
      "list_expenses",
      "List expenses, optionally filtered by project or status.",
      {
        projectId: z.string().optional(),
        status: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
      },
      async ({ projectId, status }, extra) => {
        const ctx = ctxFrom(extra);
        if (projectId) {
          const project = await requireProjectForActor(projectId, ctx);
          if (!project) return errorResult("Project not found.");
        }
        const expenses = await prisma.expense.findMany({
          where: {
            orgId: ctx.orgId,
            ...(projectId ? { projectId } : {}),
            ...(status ? { status } : {}),
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { incurredAt: "desc" },
        });
        return text(expenses);
      }
    );

    server.tool(
      "log_expense",
      "Submit an expense against a project (receipt file uploads aren't supported over MCP — use the web app for those). Auto-approved for owners/admins or amounts under the org's approval threshold.",
      {
        projectId: z.string(),
        description: z.string().min(1).max(200),
        category: z.string().max(100).optional().describe(expenseCategoryDescription),
        amount: z.number().positive(),
        incurredAt: z.string().describe("ISO date"),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const org = await prisma.organization.findUniqueOrThrow({
          where: { id: ctx.orgId },
          select: { expenseApprovalThreshold: true },
        });
        const isManager = ctx.role === "OWNER" || ctx.role === "ADMIN";
        const autoApproved = isManager || args.amount <= Number(org.expenseApprovalThreshold);

        const expense = await prisma.expense.create({
          data: {
            orgId: ctx.orgId,
            projectId,
            description: args.description,
            category: args.category ?? null,
            amount: args.amount,
            incurredAt: new Date(args.incurredAt),
            submittedById: ctx.actorId,
            status: autoApproved ? "APPROVED" : "PENDING",
            approvedById: isManager && autoApproved ? ctx.actorId : null,
            approvedAt: isManager && autoApproved ? new Date() : null,
          },
        });
        return text(expense);
      }
    );

    server.tool(
      "approve_expense",
      "Approve a pending expense. Owner/admin only.",
      { expenseId: z.string(), projectId: z.string() },
      async ({ expenseId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can approve expenses.");
        }
        const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!expense || expense.orgId !== ctx.orgId || expense.projectId !== projectId) {
          return errorResult("Expense not found.");
        }
        if (expense.status !== "PENDING") return errorResult("This expense isn't pending approval.");

        const updated = await prisma.expense.update({
          where: { id: expenseId },
          data: { status: "APPROVED", approvedById: ctx.actorId, approvedAt: new Date() },
        });
        return text(updated);
      }
    );

    server.tool(
      "reject_expense",
      "Reject a pending expense. Owner/admin only.",
      { expenseId: z.string(), projectId: z.string() },
      async ({ expenseId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can reject expenses.");
        }
        const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
        if (!expense || expense.orgId !== ctx.orgId || expense.projectId !== projectId) {
          return errorResult("Expense not found.");
        }
        if (expense.status !== "PENDING") return errorResult("This expense isn't pending approval.");

        const updated = await prisma.expense.update({
          where: { id: expenseId },
          data: { status: "REJECTED", approvedById: ctx.actorId, approvedAt: new Date() },
        });
        return text(updated);
      }
    );

    server.tool(
      "list_invoices",
      "List invoices in the current organization, optionally filtered by status. Each invoice includes isOverdue/daysOverdue (true only for a SENT invoice past its due date).",
      { status: z.enum(["DRAFT", "SENT", "PAID", "VOID"]).optional() },
      async ({ status }, extra) => {
        const ctx = ctxFrom(extra);
        const invoices = await prisma.invoice.findMany({
          where: { orgId: ctx.orgId, ...(status ? { status } : {}) },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(
          invoices.map((inv) => ({
            ...inv,
            isOverdue: isOverdue(inv.status, inv.dueDate),
            daysOverdue: daysOverdue(inv.dueDate),
          }))
        );
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

    server.tool(
      "mark_invoice_sent",
      "Mark a draft invoice as sent to the client. Only draft invoices with at least one line item can be sent.",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { client: { select: { name: true } } },
        });
        if (!invoice || invoice.orgId !== ctx.orgId) return errorResult("Invoice not found.");
        if (invoice.status !== "DRAFT") return errorResult("Only draft invoices can be sent.");

        const lineItemCount = await prisma.invoiceLineItem.count({ where: { invoiceId } });
        if (lineItemCount === 0) return errorResult("Add at least one line item before sending.");

        const updated = await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "SENT" },
        });

        const org = await prisma.organization.findUniqueOrThrow({
          where: { id: ctx.orgId },
          select: { id: true, name: true, slackWebhookUrl: true },
        });
        await notifyInvoiceStatusChange(org, { ...updated, client: invoice.client }, "SENT");

        return text(updated);
      }
    );

    server.tool(
      "mark_invoice_paid",
      "Mark an invoice as paid, optionally recording a payment method.",
      { invoiceId: z.string(), paymentMethod: z.string().max(100).optional() },
      async ({ invoiceId, paymentMethod }, extra) => {
        const ctx = ctxFrom(extra);
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { client: { select: { name: true } } },
        });
        if (!invoice || invoice.orgId !== ctx.orgId) return errorResult("Invoice not found.");

        const updated = await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "PAID", ...(paymentMethod ? { paymentMethod } : {}) },
        });

        const org = await prisma.organization.findUniqueOrThrow({
          where: { id: ctx.orgId },
          select: { id: true, name: true, slackWebhookUrl: true },
        });
        await notifyInvoiceStatusChange(org, { ...updated, client: invoice.client }, "PAID");

        return text(updated);
      }
    );

    server.tool(
      "void_invoice",
      "Void an invoice.",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice || invoice.orgId !== ctx.orgId) return errorResult("Invoice not found.");

        const updated = await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "VOID" },
        });
        return text(updated);
      }
    );

    server.tool(
      "list_members",
      "List the current organization's team members and their roles.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const memberships = await prisma.membership.findMany({
          where: { orgId: ctx.orgId },
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "asc" },
        });
        return text(
          memberships.map((m) => ({
            userId: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            employmentType: m.employmentType,
          }))
        );
      }
    );
  },
  { serverInfo: { name: "consultainer", version: "1.0.0" } },
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
