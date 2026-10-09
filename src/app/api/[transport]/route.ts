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
import { checkBudgets } from "@/lib/services/budget-alerts";
import { describeAudit, findAuditEntries, parseAuditFilters } from "@/lib/audit-query";
import {
  defaultInvoiceRecipients,
  emailInvoice,
  invoiceLinks,
  InvoiceDeliveryError,
} from "@/lib/services/invoice-delivery";
import {
  pendingTimesheets,
  reviewTimesheet,
  submitTimesheet,
  TimesheetError,
} from "@/lib/services/timesheets";
import { startTimer, stopActiveTimer, TimerError } from "@/lib/services/timer";
import { toISODate } from "@/lib/date";
import {
  addTaskComment,
  deleteTaskComment,
  listTaskComments,
  setTaskWatching,
  TaskCommentError,
} from "@/lib/services/task-comments";

const clientStatusValues = ["ACTIVE", "INACTIVE"] as const;
const projectStatusValues = ["ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"] as const;
const billingTypeValues = ["HOURLY", "FLAT_FEE", "MILESTONE"] as const;
const defaultTermsArg = z
  .enum(["DUE_ON_RECEIPT", "NET15", "NET30", "NET45", "NET60", "NET90"])
  .nullable()
  .optional()
  .describe(
    "Default payment terms for new invoices. null falls back (project → client → organization); omit to leave unchanged."
  );
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
        paymentTerms: defaultTermsArg,
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
        paymentTerms: defaultTermsArg,
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
        paymentTerms: defaultTermsArg,
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
            paymentTerms: args.paymentTerms,
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
        paymentTerms: defaultTermsArg,
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
            paymentTerms: args.paymentTerms,
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

        await checkBudgets(projectId);
        return text(project);
      }
    );

    server.tool(
      "list_my_tasks",
      "List open (not-done) tasks assigned to the authenticated user, optionally filtered to one project. linearKey (e.g. RING-12) is set on tasks linked to a Linear issue.",
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
          include: {
            project: { select: { id: true, name: true } },
            externalLink: { select: { source: true, externalKey: true, externalUrl: true } },
          },
          orderBy: { createdAt: "desc" },
        });
        return text(
          tasks.map(({ externalLink, ...task }) => ({
            ...task,
            linearKey: externalLink?.source === "linear" ? externalLink.externalKey : null,
            linearUrl: externalLink?.source === "linear" ? externalLink.externalUrl : null,
          }))
        );
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
        await checkBudgets(projectId, [task.id]);
        return text(task);
      }
    );

    server.tool(
      "list_task_comments",
      "List the internal comments on a task, oldest first. linearUrl is set on comments that were also posted to the task's Linear issue.",
      { taskId: z.string() },
      async ({ taskId }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          return text(await listTaskComments(ctx, taskId));
        } catch (err) {
          if (err instanceof TaskCommentError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "watch_task",
      "Follow (watch: true) or stop following (watch: false) a task's comments as the authenticated user.",
      { taskId: z.string(), watch: z.boolean().default(true) },
      async ({ taskId, watch }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          return text(await setTaskWatching(ctx, taskId, watch));
        } catch (err) {
          if (err instanceof TaskCommentError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "add_task_comment",
      "Add a comment to a task. Comments are internal unless shareWithClient is true and the project shows tasks on its client link. Notifies the assignee and watchers. Mention someone with @[Name](user:<userId>) (ids from list_members) to notify them directly. If the task is linked to a Linear issue, the comment is also posted there unless postToLinear is false.",
      {
        taskId: z.string(),
        body: z.string().trim().min(1).max(5000),
        postToLinear: z.boolean().optional(),
        shareWithClient: z.boolean().optional(),
      },
      async ({ taskId, body, postToLinear, shareWithClient }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          const { comment } = await addTaskComment(ctx, taskId, {
            body,
            postToLinear: postToLinear ?? true,
            shareWithClient: shareWithClient ?? false,
          });
          return text(comment);
        } catch (err) {
          if (err instanceof TaskCommentError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "delete_task_comment",
      "Delete a task comment. Authors can delete their own; owners and admins can delete any. A copy already posted to Linear is left there.",
      { commentId: z.string() },
      async ({ commentId }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          await deleteTaskComment(ctx, commentId);
          return text({ ok: true });
        } catch (err) {
          if (err instanceof TaskCommentError) return errorResult(err.message);
          throw err;
        }
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
      "get_active_timer",
      "The authenticated user's running timer (project, task, start time, elapsed hours), or null.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const timer = await prisma.activeTimer.findUnique({
          where: { userId: ctx.actorId },
          include: {
            project: { select: { id: true, name: true } },
            task: { select: { id: true, title: true } },
          },
        });
        if (!timer || timer.orgId !== ctx.orgId) return text(null);
        const elapsedHours =
          Math.round(((Date.now() - timer.startedAt.getTime()) / 3_600_000) * 100) / 100;
        return text({ ...timer, elapsedHours });
      }
    );

    server.tool(
      "start_timer",
      "Start a timer for the authenticated user on a task (its project is used) or a project. A timer already running is stopped and logged first.",
      {
        taskId: z.string().optional(),
        projectId: z.string().optional().describe("Required when no taskId is given"),
        description: z.string().optional(),
        billable: z.boolean().default(true),
        date: z
          .string()
          .optional()
          .describe("ISO date to log a stopped timer under; defaults to today (server time)"),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        let projectId = args.projectId;
        if (args.taskId) {
          const task = await prisma.task.findUnique({
            where: { id: args.taskId },
            include: { project: { select: { orgId: true } } },
          });
          if (!task || task.project.orgId !== ctx.orgId) return errorResult("Task not found.");
          projectId = task.projectId;
        }
        if (!projectId) return errorResult("Give a taskId or a projectId.");
        try {
          const timer = await startTimer(
            timeEntryContext(ctx),
            { projectId, taskId: args.taskId, description: args.description, billable: args.billable },
            args.date ?? toISODate(new Date())
          );
          return text(timer);
        } catch (err) {
          if (err instanceof TimerError || err instanceof TimeEntryError) {
            return errorResult(err.message);
          }
          throw err;
        }
      }
    );

    server.tool(
      "stop_timer",
      "Stop the authenticated user's running timer and log it as a time entry. Returns the entry, or null when nothing was running (or under 36 seconds had passed).",
      {
        date: z
          .string()
          .optional()
          .describe("ISO date to log the entry under; defaults to today (server time)"),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        try {
          const entry = await stopActiveTimer(
            timeEntryContext(ctx),
            args.date ?? toISODate(new Date())
          );
          return text(entry);
        } catch (err) {
          if (err instanceof TimeEntryError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "submit_timesheet",
      "Submit the authenticated user's week of time for approval (when the organization requires it). Any date in the week works.",
      { week: z.string().describe("ISO date in the week, e.g. 2026-10-05") },
      async ({ week }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          return text(await submitTimesheet(ctx, week));
        } catch (err) {
          if (err instanceof TimesheetError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_pending_timesheets",
      "Owner/admin only: submitted timesheets waiting for review, with their entries.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can review timesheets.");
        }
        return text(await pendingTimesheets(ctx.orgId));
      }
    );

    server.tool(
      "review_timesheet",
      "Owner/admin only: approve a submitted timesheet (its time becomes invoiceable) or send it back with a note saying what to change.",
      {
        timesheetId: z.string(),
        approve: z.boolean(),
        note: z.string().max(2000).optional().describe("Required when sending back"),
      },
      async ({ timesheetId, approve, note }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          return text(await reviewTimesheet(ctx, timesheetId, { approve, note }));
        } catch (err) {
          if (err instanceof TimesheetError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_audit_log",
      "Owner/admin only: who changed what in the organization, newest first. Filter by actor (user id, or 'system'), entity type (e.g. Invoice, Task, PaymentMethod), action (create, update, delete, sign_in, view, download, export), and date range.",
      {
        actor: z.string().optional(),
        type: z.string().optional(),
        action: z.string().optional(),
        from: z.string().optional().describe("yyyy-mm-dd, inclusive"),
        to: z.string().optional().describe("yyyy-mm-dd, inclusive"),
        limit: z.number().int().min(1).max(200).default(50),
        page: z.number().int().min(0).default(0),
      },
      async ({ limit, page, ...filters }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can read the audit log.");
        }
        const rows = await findAuditEntries(ctx.orgId, parseAuditFilters(filters), {
          skip: page * limit,
          take: limit + 1,
        });
        return text({
          entries: rows.slice(0, limit).map((e) => ({
            at: e.createdAt,
            actor: e.actor?.name ?? (e.via === "system" ? "System" : null),
            via: e.via,
            summary: describeAudit(e),
            entityType: e.entityType,
            entityId: e.entityId,
            entityLabel: e.entityLabel,
            changes: e.changes,
            ipAddress: e.ipAddress,
          })),
          nextPage: rows.length > limit ? page + 1 : null,
        });
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
        dueDate: z
          .string()
          .optional()
          .describe("ISO date. Defaults to the issue date plus the payment terms."),
        paymentTerms: z
          .enum(["DUE_ON_RECEIPT", "NET15", "NET30", "NET45", "NET60", "NET90", "CUSTOM"])
          .optional()
          .describe(
            "Defaults to the project's terms (when every item is from one project that sets them), else the client's, else the org's."
          ),
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
      "email_invoice",
      "Owner/admin only: email an invoice to the client with a link to view and pay it (opens are tracked and alert the org). A draft is marked sent. Recipients default to the client's invoice contacts, else its billing email.",
      {
        invoiceId: z.string(),
        to: z.array(z.string().email()).max(20).optional(),
        message: z.string().max(2000).optional(),
      },
      async ({ invoiceId, to, message }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can send invoices.");
        }
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice || invoice.orgId !== ctx.orgId) return errorResult("Invoice not found.");
        try {
          const recipients = to?.length ? to : await defaultInvoiceRecipients(invoice.clientId);
          return text(
            await emailInvoice({ orgId: ctx.orgId, actorId: ctx.actorId }, invoiceId, {
              to: recipients,
              message,
            })
          );
        } catch (err) {
          if (err instanceof InvoiceDeliveryError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "get_invoice_activity",
      "When an invoice was emailed, reminded, and opened by the client, plus its client-facing link (sent invoices only).",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        const invoice = await prisma.invoice.findUnique({
          where: { id: invoiceId },
          include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
        });
        if (!invoice || invoice.orgId !== ctx.orgId) return errorResult("Invoice not found.");
        return text({
          clientLink: invoice.status === "DRAFT" ? null : (await invoiceLinks(invoice.id)).viewUrl,
          firstViewedAt: invoice.firstViewedAt,
          lastViewedAt: invoice.lastViewedAt,
          viewCount: invoice.viewCount,
          events: invoice.events.map((e) => ({
            type: e.type,
            recipients: e.recipients,
            detail: e.detail,
            at: e.createdAt,
          })),
        });
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
