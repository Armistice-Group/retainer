import { z } from "zod";
import { listBookings } from "@/lib/services/scheduling";
import { DRAFT_CLIENT_ERROR, isDraftClient } from "@/lib/client-status";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { authenticateApiRequest, hideShareToken, type ApiAuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/file-storage";
import {
  projectVisibilityWhere,
  canViewProject,
  canAssignOnProject,
  invoiceVisibilityWhere,
} from "@/lib/project-access";
import { taskStatusValues, isoDay, dueDateValue } from "@/lib/validations/task";
import { dueDateData, milestoneDueDateData } from "@/lib/services/deadlines";
import {
  cancelScheduledSend,
  scheduleInvoiceSend,
  ScheduleError,
} from "@/lib/services/scheduled-invoices";
import {
  createTimeEntry,
  updateTimeEntry,
  deleteTimeEntry,
  TimeEntryError,
} from "@/lib/services/time-entries";
import {
  canChangeInvoiceStatusByKey,
  generateInvoice,
  invoiceStatusChangeError,
  notifyInvoiceStatusChange,
  voidInvoice,
  InvoiceError,
} from "@/lib/services/invoices";
import { isOverdue, daysOverdue } from "@/lib/invoice-aging";
import {
  canManagePayments,
  invoiceLedger,
  invoiceMoneyFields,
  markInvoicePaidInFull,
  PaymentError,
  recordPayment,
} from "@/lib/services/payments";
import { soloMemberId } from "@/lib/org";
import { defaultBillRateFor, resolveBillRate } from "@/lib/bill-rates";
import { pushTaskToLinear } from "@/lib/services/linear-sync";
import { visibleAgreements } from "@/lib/services/agreements";
import { listVaultLinks, vaultLinkJson, VaultLinkError } from "@/lib/services/vault-links";
import { checkBudgets } from "@/lib/services/budget-alerts";
import {
  CalendarError,
  ignoreMeeting,
  logMeeting,
  meetingHours,
  pendingMeetings,
} from "@/lib/services/calendar";
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
import { alertExpenseSubmitted, notifyExpenseReviewed } from "@/lib/services/expense-alerts";
import { toISODate } from "@/lib/date";
import {
  addTaskComment,
  deleteTaskComment,
  listTaskComments,
  setTaskWatching,
  TaskCommentError,
} from "@/lib/services/task-comments";
import {
  canManageEstimates,
  createEstimate,
  estimateForApi,
  estimateVisibilityWhere,
  EstimateError,
  ESTIMATE_STATUSES,
  expireEstimates,
} from "@/lib/services/estimates";
import { estimateInputSchema } from "@/lib/validations/estimate";

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

/** A date string the tools can safely pass to new Date(). */
const isoDate = () =>
  z.string().refine((v) => !Number.isNaN(new Date(v).getTime()), "Use an ISO date, e.g. 2026-07-23.");

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

/** An invoice in the key's org that its user may see (see invoiceVisibilityWhere). */
function visibleInvoiceWhere(ctx: ApiAuthContext, invoiceId: string) {
  return { id: invoiceId, orgId: ctx.orgId, ...invoiceVisibilityWhere(ctx.actorId, ctx.role) };
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
    // Database and date errors that slip through become a plain message:
    // Prisma's text includes query details (ids) that shouldn't reach clients.
    const register = server.tool.bind(server) as (...params: unknown[]) => unknown;
    server.tool = ((...params: unknown[]) => {
      const callback = params[params.length - 1] as (...args: unknown[]) => Promise<unknown>;
      params[params.length - 1] = async (...args: unknown[]) => {
        try {
          return await callback(...args);
        } catch (err) {
          if (err instanceof RangeError || (err instanceof Error && err.name.startsWith("PrismaClient"))) {
            console.error("[mcp]", err);
            return errorResult("That request couldn't be completed. Check the ids and dates and try again.");
          }
          throw err;
        }
      };
      return register(...params);
    }) as typeof server.tool;

    server.tool(
      "list_clients",
      "List clients in the current organization. Draft clients (status LEAD, draft: true) are people who booked a call through Cal.com or Calendly and haven't been made a client yet; they can't be invoiced or get projects. status filters.",
      { status: z.enum(["ACTIVE", "INACTIVE", "LEAD"]).optional() },
      async ({ status }, extra) => {
        const ctx = ctxFrom(extra);
        const clients = await prisma.client.findMany({
          where: { orgId: ctx.orgId, ...(status ? { status } : {}) },
          orderBy: { name: "asc" },
        });
        return text(clients.map((c) => ({ ...hideShareToken(c, ctx.role), draft: c.status === "LEAD" })));
      }
    );

    server.tool(
      "list_bookings",
      "Meetings booked through Cal.com or Calendly. Owners and admins see all of the organization's; others the ones they host. Each has its client (draft: true for a draft client created from the booking), invitee, time, status and the booking form's answers.",
      {
        from: isoDate().optional().describe("ISO date: bookings starting on or after"),
        to: isoDate().optional().describe("ISO date: bookings starting before"),
        clientId: z.string().optional(),
        status: z.enum(["SCHEDULED", "CANCELLED", "RESCHEDULED", "NO_SHOW"]).optional(),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        const bookings = await listBookings(
          { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
          {
            from: args.from ? new Date(`${args.from}T00:00:00Z`) : undefined,
            to: args.to ? new Date(`${args.to}T00:00:00Z`) : undefined,
            clientId: args.clientId,
            status: args.status,
          }
        );
        return text(
          bookings.map((b) => ({
            id: b.id,
            provider: b.provider,
            title: b.title,
            eventType: b.eventTypeName,
            start: b.startAt,
            end: b.endAt,
            status: b.status,
            invitee: { name: b.inviteeName, email: b.inviteeEmail, phone: b.inviteePhone },
            client: b.client ? { id: b.client.id, name: b.client.name, draft: b.client.status === "LEAD" } : null,
            joinUrl: b.joinUrl,
            answers: b.answers,
          }))
        );
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
        return text(hideShareToken(client, ctx.role));
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
        status: z
          .enum(clientStatusValues)
          .optional()
          .describe("Leave out to keep the current status. On a draft client, ACTIVE makes it a client (owners and admins)."),
      },
      async ({ clientId, ...rest }, extra) => {
        const ctx = ctxFrom(extra);
        const existing = await prisma.client.findUnique({ where: { id: clientId } });
        if (!existing || existing.orgId !== ctx.orgId) return errorResult("Client not found.");
        if (existing.status === "LEAD" && rest.status && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can make a draft client a client.");
        }
        const client = await prisma.client.update({
          where: { id: clientId },
          data: rest,
        });
        return text(hideShareToken(client, ctx.role));
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
        return text(projects.map((p) => hideShareToken(p, ctx.role)));
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
        startDate: isoDate().optional().describe("ISO date"),
        endDate: isoDate().optional().describe("ISO date"),
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
        if (isDraftClient(client)) return errorResult(DRAFT_CLIENT_ERROR);

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
              billRate: await defaultBillRateFor(ctx.orgId, ctx.actorId),
              currency: ctx.defaultCurrency,
            },
          });
        }

        return text(hideShareToken(project, ctx.role));
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
        startDate: isoDate().optional().describe("ISO date"),
        endDate: isoDate().optional().describe("ISO date"),
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
        if (isDraftClient(client)) return errorResult(DRAFT_CLIENT_ERROR);

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
              billRate: await defaultBillRateFor(ctx.orgId, ctx.actorId),
              currency: ctx.defaultCurrency,
            },
            update: {},
          });
        }

        await checkBudgets(projectId);
        return text(hideShareToken(project, ctx.role));
      }
    );

    server.tool(
      "list_my_tasks",
      "List open (not-done) tasks assigned to the authenticated user, optionally filtered to one project, soonest due date first (tasks without one last). linearKey (e.g. RING-12) is set on tasks linked to a Linear issue.",
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
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
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
        const existing = await prisma.task.findFirst({ where: { id: taskId, projectId }, select: { id: true } });
        if (!existing) return errorResult("Task not found on that project.");
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
      "Create a new task on a project, optionally with a due date (the assignee is reminded the day before, and again if it's overdue).",
      {
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        assigneeId: z.string().optional(),
        estimatedHours: z.number().positive().optional(),
        dueDate: isoDay.optional().describe("YYYY-MM-DD"),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");
        if (args.assigneeId && !(await canAssignOnProject(project, args.assigneeId))) {
          return errorResult("That person can't be assigned tasks on this project.");
        }

        const task = await prisma.task.create({
          data: {
            projectId,
            title: args.title,
            description: args.description ?? null,
            assigneeId: args.assigneeId || (await soloMemberId(ctx.orgId)),
            estimatedHours: args.estimatedHours ?? null,
            dueDate: dueDateValue(args.dueDate) ?? null,
          },
        });
        await pushTaskToLinear(task.id);
        return text(task);
      }
    );

    server.tool(
      "update_task",
      "Update a task's title, description, hour estimate or due date (not its status or assignee — see update_task_status). Omit dueDate to keep it, or pass null to clear it.",
      {
        taskId: z.string(),
        projectId: z.string(),
        title: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        estimatedHours: z.number().positive().optional(),
        dueDate: isoDay.nullable().optional().describe("YYYY-MM-DD, or null to clear"),
      },
      async ({ taskId, projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const existing = await prisma.task.findFirst({
          where: { id: taskId, projectId },
          select: { id: true, dueDate: true },
        });
        if (!existing) return errorResult("Task not found on that project.");
        const task = await prisma.task.update({
          where: { id: taskId, projectId },
          data: {
            title: args.title,
            description: args.description ?? null,
            estimatedHours: args.estimatedHours ?? null,
            ...dueDateData(existing.dueDate, dueDateValue(args.dueDate)),
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
        date: isoDate().describe("ISO date, e.g. 2026-07-23"),
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
        date: isoDate()
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
        date: isoDate()
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
      "Owner/admin only: who changed what in the organization, newest first. Filter by actor (user id, or 'system'), entity type (e.g. Invoice, Task, PaymentMethod), action (create, update, delete, sign_in, view, download, export, password_reset, password_reset_link, share_verify, share_sign_out), and date range.",
      {
        actor: z.string().optional(),
        type: z.string().optional(),
        action: z.string().optional(),
        from: isoDate().optional().describe("yyyy-mm-dd, inclusive"),
        to: isoDate().optional().describe("yyyy-mm-dd, inclusive"),
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
      "list_meetings",
      "Meetings from the authenticated user's connected calendars that haven't been sorted yet (last two weeks), each with a suggested project and why.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const meetings = await pendingMeetings(ctx.actorId, ctx.orgId);
        return text(
          meetings.map((m) => ({
            id: m.id,
            title: m.title,
            start: m.start,
            end: m.end,
            hours: meetingHours(m),
            attendees: m.attendees,
            suggestedProjectId: m.suggestedProjectId,
            suggestionReason: m.suggestionReason,
            bookedBy: m.booking?.client
              ? { clientId: m.booking.client.id, name: m.booking.client.name, draft: m.booking.client.status === "LEAD" }
              : null,
            suggestedBillable: m.booking?.eventType?.billable ?? true,
          }))
        );
      }
    );

    server.tool(
      "log_meeting",
      "Log a calendar meeting (from list_meetings) as time on a project, for its duration. remember: also sort future meetings in the same recurring series this way.",
      {
        meetingId: z.string(),
        projectId: z.string(),
        taskId: z.string().optional(),
        billable: z.boolean().default(true),
        date: isoDate().optional().describe("ISO date to log under; defaults to the meeting's UTC date"),
        remember: z.boolean().default(false),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        const meeting = await prisma.calendarEvent.findUnique({ where: { id: args.meetingId } });
        if (!meeting || meeting.userId !== ctx.actorId) return errorResult("Meeting not found.");
        try {
          const r = await logMeeting(timeEntryContext(ctx), args.meetingId, {
            ...args,
            date: args.date ?? meeting.start.toISOString().slice(0, 10),
          });
          return text({ timeEntry: r.entry, alsoLogged: r.alsoLogged });
        } catch (err) {
          if (err instanceof CalendarError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "ignore_meeting",
      "Mark a calendar meeting as not project work. remember: ignore future meetings in the series too.",
      { meetingId: z.string(), remember: z.boolean().default(false) },
      async ({ meetingId, remember }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          await ignoreMeeting(timeEntryContext(ctx), meetingId, remember);
          return text({ ok: true });
        } catch (err) {
          if (err instanceof CalendarError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_time_entries",
      "List the authenticated user's logged time entries, optionally filtered.",
      {
        from: isoDate().optional().describe("ISO date, inclusive lower bound"),
        to: isoDate().optional().describe("ISO date, inclusive upper bound"),
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
        date: isoDate(),
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
      "list_agreements",
      "List a client's signed agreements (pulled from DocuSign, Documenso or Ironclad): title, signed date, signers, provider link. Includes its projects' agreements you can see; pass projectId for one project.",
      { clientId: z.string(), projectId: z.string().optional() },
      async ({ clientId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        const client = await prisma.client.findUnique({ where: { id: clientId }, select: { orgId: true } });
        if (!client || client.orgId !== ctx.orgId) return errorResult("Client not found.");
        const agreements = await visibleAgreements(
          { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
          { clientId, projectId }
        );
        return text(
          agreements.map((a) => ({
            id: a.id,
            provider: a.provider,
            title: a.title,
            signedAt: a.signedAt,
            signers: a.signers,
            projectId: a.projectId,
            projectName: a.projectName,
            url: a.externalUrl,
            hasSignedCopy: a.hasFile,
          }))
        );
      }
    );

    server.tool(
      "list_vault_links",
      "List a client's credential links: pointers to items in 1Password, Bitwarden or another password manager (label, note, provider, link). Never the secrets themselves — open the link in the password manager, which decides access. Includes its projects' links you can see; pass projectId for one project's links.",
      { clientId: z.string(), projectId: z.string().optional() },
      async ({ clientId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        try {
          const links = await listVaultLinks(
            { orgId: ctx.orgId, userId: ctx.actorId, role: ctx.role },
            { clientId, projectId }
          );
          return text(links.map(vaultLinkJson));
        } catch (err) {
          if (err instanceof VaultLinkError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_milestones",
      "List a project's milestones and deliverables. billable is false for a deliverable (tracked and dated, never invoiced, amount 0).",
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
      "Owner/admin only: create a milestone on a project — a fixed-price payment milestone (billable, the default; amount required), or a deliverable (billable: false; never invoiced, no amount).",
      {
        projectId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        billable: z.boolean().default(true).describe("false for a deliverable that is never invoiced"),
        amount: z.number().positive().optional().describe("Required when billable"),
        dueDate: isoDay.optional().describe("YYYY-MM-DD"),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can manage milestones.");
        }
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");
        if (args.billable && !args.amount) {
          return errorResult("A billable milestone needs an amount (or set billable: false for a deliverable).");
        }

        const count = await prisma.milestone.count({ where: { projectId } });
        const milestone = await prisma.milestone.create({
          data: {
            projectId,
            name: args.name,
            description: args.description ?? null,
            billable: args.billable,
            amount: args.billable ? args.amount! : 0,
            dueDate: dueDateValue(args.dueDate) ?? null,
            sortOrder: count,
          },
        });
        return text(milestone);
      }
    );

    server.tool(
      "update_milestone",
      "Owner/admin only: update a milestone's or deliverable's name, description, amount, billable flag, or due date (not yet invoiced). Omitting dueDate clears it; omitting billable or amount keeps them.",
      {
        milestoneId: z.string(),
        projectId: z.string(),
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        billable: z.boolean().optional().describe("false makes it a deliverable that is never invoiced"),
        amount: z.number().positive().optional(),
        dueDate: isoDay.optional().describe("YYYY-MM-DD"),
      },
      async ({ milestoneId, projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can manage milestones.");
        }
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");

        const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId } });
        if (!milestone || milestone.projectId !== projectId) {
          return errorResult("Milestone not found.");
        }
        if (milestone.invoicedAt) {
          return errorResult("This milestone has already been invoiced and can't be edited.");
        }
        const billable = args.billable ?? milestone.billable;
        const amount = billable ? (args.amount ?? Number(milestone.amount)) : 0;
        if (billable && !(amount > 0)) {
          return errorResult("A billable milestone needs an amount (or set billable: false for a deliverable).");
        }

        const updated = await prisma.milestone.update({
          where: { id: milestoneId },
          data: {
            name: args.name,
            description: args.description ?? null,
            billable,
            amount,
            ...milestoneDueDateData(milestone.dueDate, dueDateValue(args.dueDate) ?? null),
          },
        });
        return text(updated);
      }
    );

    server.tool(
      "complete_milestone",
      "Owner/admin only: mark a milestone complete with a note describing what was delivered (evidence file uploads aren't supported over MCP — use the web app for those).",
      {
        milestoneId: z.string(),
        projectId: z.string(),
        completionNote: z.string().min(1).max(2000),
        completionUrl: z.string().url().optional(),
      },
      async ({ milestoneId, projectId, completionNote, completionUrl }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can manage milestones.");
        }
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
      "Owner/admin only: clear a milestone's completion (not yet invoiced).",
      { milestoneId: z.string(), projectId: z.string() },
      async ({ milestoneId, projectId }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can manage milestones.");
        }
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
            completionFileName: null,
            completionFileData: null,
            completionStorageKey: null,
            completionFileContentType: null,
          },
        });
        await deleteStoredFile({ storageKey: milestone.completionStorageKey });
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
            // Not other people's confidential projects (members only).
            project: projectVisibilityWhere(ctx.actorId, ctx.role),
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
        incurredAt: isoDate().describe("ISO date"),
      },
      async ({ projectId, ...args }, extra) => {
        const ctx = ctxFrom(extra);
        const project = await requireProjectForActor(projectId, ctx);
        if (!project) return errorResult("Project not found.");
        if (Number.isNaN(new Date(args.incurredAt).getTime())) {
          return errorResult("incurredAt must be an ISO date, like 2026-10-01.");
        }

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
        if (expense.status === "PENDING") await alertExpenseSubmitted(expense.id);
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
        await notifyExpenseReviewed(expenseId, { id: ctx.actorId, name: ctx.actorName });
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
        await notifyExpenseReviewed(expenseId, { id: ctx.actorId, name: ctx.actorName });
        return text(updated);
      }
    );

    server.tool(
      "list_invoices",
      "List invoices in the current organization, optionally filtered by status. Each invoice includes isOverdue/daysOverdue (true only for a SENT invoice past its due date), amountPaid, creditApplied and balanceDue (total minus payments and applied credit; a partly paid invoice stays SENT until it reaches 0). kind is STANDARD or DEPOSIT.",
      { status: z.enum(["DRAFT", "SENT", "PAID", "VOID"]).optional() },
      async ({ status }, extra) => {
        const ctx = ctxFrom(extra);
        const invoices = await prisma.invoice.findMany({
          where: {
            orgId: ctx.orgId,
            ...(status ? { status } : {}),
            ...invoiceVisibilityWhere(ctx.actorId, ctx.role),
          },
          include: { client: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        });
        return text(
          invoices.map((inv) => ({
            ...inv,
            ...invoiceMoneyFields(inv),
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
        issueDate: isoDate(),
        dueDate: isoDate()
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
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
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
      "schedule_invoice_send",
      "Owner/admin only: schedule a draft invoice to be emailed to the client's default invoice recipients at a set time (sent within the hour after it), or pass sendAt: null to cancel. When it goes out, its issue date becomes the send date and its due date moves with it. If it can't be sent it stays a draft and owners/admins are alerted.",
      {
        invoiceId: z.string(),
        sendAt: z
          .string()
          .refine((v) => !Number.isNaN(new Date(v).getTime()), "Use an ISO date-time, e.g. 2026-07-23T09:00:00Z.")
          .nullable()
          .describe("ISO date-time with a time zone, e.g. 2026-07-23T09:00:00-05:00; null cancels"),
      },
      async ({ invoiceId, sendAt }, extra) => {
        const ctx = ctxFrom(extra);
        if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
          return errorResult("Only owners and admins can schedule invoices.");
        }
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
        try {
          const updated =
            sendAt === null
              ? await cancelScheduledSend({ orgId: ctx.orgId }, invoiceId)
              : await scheduleInvoiceSend({ orgId: ctx.orgId, actorId: ctx.actorId }, invoiceId, new Date(sendAt));
          return text({
            id: updated.id,
            number: updated.number,
            status: updated.status,
            scheduledSendAt: updated.scheduledSendAt,
          });
        } catch (err) {
          if (err instanceof ScheduleError) return errorResult(err.message);
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
        const invoice = await prisma.invoice.findFirst({
          where: visibleInvoiceWhere(ctx, invoiceId),
          include: { events: { orderBy: { createdAt: "desc" }, take: 50 } },
        });
        if (!invoice) return errorResult("Invoice not found.");
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
      "Owner/admin only: mark a draft invoice as sent to the client. Only draft invoices with at least one line item can be sent.",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        if (!canChangeInvoiceStatusByKey(ctx.role)) {
          return errorResult("Only owners and admins can change an invoice's status.");
        }
        const invoice = await prisma.invoice.findFirst({
          where: visibleInvoiceWhere(ctx, invoiceId),
          include: { client: { select: { name: true } } },
        });
        if (!invoice) return errorResult("Invoice not found.");
        const statusError = invoiceStatusChangeError(invoice.status, "SENT");
        if (statusError) return errorResult(statusError);

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
      "Owner/admin only: mark a sent invoice as paid by recording a payment for its whole balance due (today), optionally with a payment method. For a part payment use record_invoice_payment.",
      { invoiceId: z.string(), paymentMethod: z.string().max(100).optional() },
      async ({ invoiceId, paymentMethod }, extra) => {
        const ctx = ctxFrom(extra);
        if (!canChangeInvoiceStatusByKey(ctx.role)) {
          return errorResult("Only owners and admins can change an invoice's status.");
        }
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
        const statusError = invoiceStatusChangeError(invoice.status, "PAID");
        if (statusError) return errorResult(statusError);

        try {
          const result = await markInvoicePaidInFull({ orgId: ctx.orgId, actorId: ctx.actorId }, invoiceId, {
            method: paymentMethod ?? null,
          });
          return text({ ...result.invoice, ...invoiceMoneyFields(result.invoice), payment: result.payment });
        } catch (err) {
          if (err instanceof PaymentError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "record_invoice_payment",
      "Owner/admin only: record money received against a sent invoice (a part payment or the rest of it). amount can't exceed the balance due. The invoice becomes PAID when its balance reaches 0.",
      {
        invoiceId: z.string(),
        amount: z.number().positive().describe("In the invoice's currency, e.g. 1250.50."),
        receivedAt: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("yyyy-mm-dd; defaults to today."),
        method: z.string().max(100).optional().describe("e.g. Wire, ACH, Check #1042."),
        reference: z.string().max(200).optional(),
        note: z.string().max(1000).optional(),
      },
      async ({ invoiceId, ...input }, extra) => {
        const ctx = ctxFrom(extra);
        if (!canManagePayments(ctx.role)) {
          return errorResult("Only owners and admins can record payments.");
        }
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
        try {
          const result = await recordPayment({ orgId: ctx.orgId, actorId: ctx.actorId }, { invoiceId, ...input });
          return text({
            payment: result.payment,
            invoice: { ...result.invoice, ...invoiceMoneyFields(result.invoice) },
          });
        } catch (err) {
          if (err instanceof PaymentError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_invoice_payments",
      "Payments recorded against an invoice, credit applied to it, and credit notes issued against it.",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
        const ledger = await invoiceLedger(invoiceId);
        return text({
          ...invoiceMoneyFields(invoice),
          payments: ledger.payments.map(({ recordedBy, ...p }) => ({ ...p, recordedBy: recordedBy?.name ?? null })),
          creditApplications: ledger.credits.map(({ appliedBy, ...c }) => ({ ...c, appliedBy: appliedBy?.name ?? null })),
          creditNotes: ledger.creditNotes,
        });
      }
    );

    server.tool(
      "void_invoice",
      "Owner/admin only: void a draft or sent invoice. Its time entries, milestones and expenses go back to unbilled so they can be invoiced again; the voided invoice keeps its line items as a record.",
      { invoiceId: z.string() },
      async ({ invoiceId }, extra) => {
        const ctx = ctxFrom(extra);
        if (!canChangeInvoiceStatusByKey(ctx.role)) {
          return errorResult("Only owners and admins can change an invoice's status.");
        }
        const invoice = await prisma.invoice.findFirst({ where: visibleInvoiceWhere(ctx, invoiceId) });
        if (!invoice) return errorResult("Invoice not found.");
        const statusError = invoiceStatusChangeError(invoice.status, "VOID");
        if (statusError) return errorResult(statusError);

        try {
          const { invoice: updated, released } = await voidInvoice(ctx.orgId, invoiceId);
          return text({ ...updated, released });
        } catch (err) {
          if (err instanceof InvoiceError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_estimates",
      "List estimates (quotes) in the current organization, newest first, optionally by status or client. A member doesn't see estimates for a confidential project they're not on.",
      {
        status: z.enum(ESTIMATE_STATUSES).optional(),
        clientId: z.string().optional(),
      },
      async ({ status, clientId }, extra) => {
        const ctx = ctxFrom(extra);
        await expireEstimates({ orgId: ctx.orgId });
        const estimates = await prisma.estimate.findMany({
          where: {
            orgId: ctx.orgId,
            ...(status ? { status } : {}),
            ...(clientId ? { clientId } : {}),
            ...estimateVisibilityWhere(ctx.actorId, ctx.role),
          },
          include: {
            client: { select: { id: true, name: true } },
            lineItems: { orderBy: { sortOrder: "asc" } },
          },
          orderBy: { createdAt: "desc" },
        });
        return text(estimates.map((e) => estimateForApi(e, ctx.role)));
      }
    );

    server.tool(
      "create_estimate",
      "Owner/admin only: create a draft estimate (EST-0001, …) for a client, with line items and optional scope text, expiry and proposed billing for the project it becomes once accepted. Send it from the app.",
      {
        clientId: z.string(),
        projectId: z
          .string()
          .optional()
          .describe("An existing project of this client the estimate is for. Omit to create a project once it's accepted."),
        title: z.string().min(1).max(200),
        intro: z
          .string()
          .max(20000)
          .optional()
          .describe("Scope text. Plain text or simple markdown: # headings, - lists, **bold**, [links](https://…)."),
        issueDate: isoDate().optional().describe("YYYY-MM-DD. Defaults to today (UTC)."),
        expiresAt: z.string().optional().describe("YYYY-MM-DD, the last day the client can accept. Omit for no expiry."),
        taxRate: z.number().min(0).max(100).default(0),
        proposedBillingType: z
          .enum(["HOURLY", "FLAT_FEE", "MILESTONE"])
          .optional()
          .describe("Billing type of the project created on acceptance. Default: MILESTONE if any line is a milestone, else FLAT_FEE."),
        proposedRate: z.number().positive().optional().describe("Hourly rate, for an HOURLY project."),
        proposedBudget: z.number().positive().optional().describe("Project budget. Defaults to the estimate subtotal."),
        lineItems: z
          .array(
            z.object({
              description: z.string().min(1).max(500),
              quantity: z.number().min(0),
              rate: z.number().min(0).describe("Unit price."),
              isMilestone: z.boolean().default(false),
              milestoneDueDate: isoDate().optional().describe("YYYY-MM-DD"),
              milestoneDueDays: z.number().int().min(0).optional().describe("Days after acceptance."),
            })
          )
          .min(1)
          .max(200),
      },
      async (args, extra) => {
        const ctx = ctxFrom(extra);
        if (!canManageEstimates(ctx.role)) {
          return errorResult("Only owners and admins can manage estimates.");
        }
        const parsed = estimateInputSchema.safeParse(args);
        if (!parsed.success) return errorResult(parsed.error.issues[0]?.message ?? "Invalid estimate.");
        try {
          const estimate = await createEstimate(
            { orgId: ctx.orgId, actorId: ctx.actorId, role: ctx.role },
            parsed.data
          );
          return text(estimateForApi(estimate, ctx.role));
        } catch (err) {
          if (err instanceof EstimateError) return errorResult(err.message);
          throw err;
        }
      }
    );

    server.tool(
      "list_members",
      "List the current organization's team members and their roles. For owner and admin keys, billRate is each person's default hourly bill rate (their own, else the organization's, else 0; in the org's default currency) — the rate they start at when added to a project.",
      {},
      async (_args, extra) => {
        const ctx = ctxFrom(extra);
        const canSeeRates = ctx.role === "OWNER" || ctx.role === "ADMIN";
        const [memberships, org] = await Promise.all([
          prisma.membership.findMany({
            where: { orgId: ctx.orgId },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          }),
          canSeeRates
            ? prisma.organization.findUnique({
                where: { id: ctx.orgId },
                select: { defaultBillRate: true },
              })
            : null,
        ]);
        return text(
          memberships.map((m) => ({
            userId: m.user.id,
            name: m.user.name,
            email: m.user.email,
            role: m.role,
            employmentType: m.employmentType,
            ...(canSeeRates ? { billRate: resolveBillRate(m.billRate, org?.defaultBillRate) } : {}),
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
