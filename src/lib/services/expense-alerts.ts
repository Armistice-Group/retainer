import "server-only";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { AlertEmail } from "@/emails/alert-email";
import { canViewProject } from "@/lib/project-access";
import { formatCurrency } from "@/lib/format";
import { getOrigin } from "@/lib/url";

/**
 * Expense approval notifications, shared by the web app and MCP:
 *  - EXPENSE_SUBMITTED org alert when an expense lands in PENDING (in-app to
 *    owners and admins — who can see every project, confidential ones too —
 *    plus Slack/email per Settings → Alerts);
 *  - the submitter hears back (in-app, and email when it's set up) when an
 *    owner or admin approves or rejects it.
 * Both never throw: the expense itself is already saved.
 */

function expenseLink(projectId: string) {
  return `/projects/${projectId}#expenses`;
}

async function loadExpense(expenseId: string) {
  return prisma.expense.findUnique({
    where: { id: expenseId },
    include: {
      org: { select: { id: true, name: true, defaultCurrency: true } },
      project: {
        select: { id: true, name: true, confidential: true, client: { select: { name: true } } },
      },
      submittedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function alertExpenseSubmitted(expenseId: string) {
  try {
    const expense = await loadExpense(expenseId);
    if (!expense || expense.status !== "PENDING") return;

    const amount = formatCurrency(Number(expense.amount), expense.org.defaultCurrency);
    const who = expense.submittedBy.name || "Someone";
    await sendAlert({
      orgId: expense.orgId,
      event: "EXPENSE_SUBMITTED",
      message: `${who} logged a ${amount} expense on ${expense.project.name} that's waiting for approval: ${expense.description}`,
      details: [
        `Client: ${expense.project.client.name}`,
        ...(expense.category ? [`Category: ${expense.category}`] : []),
      ],
      // Slack and the alert email list can reach people who aren't on a
      // confidential project: don't name it (or what was bought) there.
      externalMessage: expense.project.confidential
        ? `${who} logged a ${amount} expense on a confidential project that's waiting for approval.`
        : undefined,
      link: expenseLink(expense.projectId),
      excludeUserId: expense.submittedById,
    });
  } catch (err) {
    console.warn("[expense-alerts] Failed to send submitted alert", err);
  }
}

export async function notifyExpenseReviewed(
  expenseId: string,
  reviewer: { id: string; name: string | null | undefined }
) {
  try {
    const expense = await loadExpense(expenseId);
    if (!expense || expense.status === "PENDING") return;
    if (expense.submittedById === reviewer.id) return;

    // Still in the org, and still able to see the project? Otherwise keep
    // the project out of it (or skip if they've left the org).
    const membership = await prisma.membership.findUnique({
      where: { userId_orgId: { userId: expense.submittedById, orgId: expense.orgId } },
      select: { role: true },
    });
    if (!membership) return;
    const canSee = await canViewProject(expense.project, expense.submittedById, membership.role);

    const approved = expense.status === "APPROVED";
    const amount = formatCurrency(Number(expense.amount), expense.org.defaultCurrency);
    const by = reviewer.name || "An admin";
    const verb = approved ? "approved" : "rejected";
    const message = canSee
      ? `${by} ${verb} your ${amount} expense on ${expense.project.name}: ${expense.description}`
      : `${by} ${verb} your ${amount} expense.`;
    const link = canSee ? expenseLink(expense.projectId) : "/notifications";

    await notify(prisma, {
      orgId: expense.orgId,
      userIds: [expense.submittedById],
      type: "EXPENSE_REVIEWED",
      message,
      link,
    });

    const origin = await getOrigin().catch(() => "");
    await sendEmail({
      to: expense.submittedBy.email,
      subject: `Your ${amount} expense was ${verb}`,
      react: AlertEmail({
        orgName: expense.org.name,
        headline: approved ? "Expense approved" : "Expense rejected",
        message,
        details: approved ? [] : ["Ask an owner or admin if you're not sure why."],
        url: `${origin}${link}`,
        origin,
      }),
    });
  } catch (err) {
    console.warn("[expense-alerts] Failed to notify submitter", err);
  }
}

/** Pending expenses an owner/admin can act on, for the dashboard. */
export async function pendingExpenses(orgId: string, take = 5) {
  const [count, items] = await Promise.all([
    prisma.expense.count({ where: { orgId, status: "PENDING" } }),
    prisma.expense.findMany({
      where: { orgId, status: "PENDING" },
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take,
    }),
  ]);
  return { count, items };
}
