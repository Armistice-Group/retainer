import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { postToSlack } from "@/lib/slack";

const THRESHOLDS = [100, 80] as const;

function levelFor(logged: number, budget: number) {
  const percent = (logged / budget) * 100;
  return THRESHOLDS.find((t) => percent >= t) ?? 0;
}

/** Alerts once when a project's logged hours reach 80% and 100% of its
 * budget, and when a task's logged hours pass its estimate. Owners and
 * admins hear about both (plus Slack); a task's assignee hears about their
 * task. Re-arms when hours fall back or the budget/estimate grows. Never
 * throws — alerts are a side effect of logging time, not part of it. */
export async function checkBudgets(projectId: string, taskIds: (string | null | undefined)[] = []) {
  try {
    await checkProject(projectId);
    for (const taskId of new Set(taskIds.filter((id): id is string => !!id))) {
      await checkTask(taskId);
    }
  } catch (err) {
    console.warn("[budget] Check failed", projectId, err);
  }
}

async function checkProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { org: { select: { slackWebhookUrl: true } } },
  });
  if (!project) return;
  const budget = project.budgetHours ? Number(project.budgetHours) : null;
  if (!budget) {
    if (project.budgetAlertLevel !== 0) {
      await prisma.project.update({ where: { id: projectId }, data: { budgetAlertLevel: 0 } });
    }
    return;
  }

  const sum = await prisma.timeEntry.aggregate({ where: { projectId }, _sum: { hours: true } });
  const logged = Number(sum._sum.hours ?? 0);
  const level = levelFor(logged, budget);
  if (level === project.budgetAlertLevel) return;

  await prisma.project.update({ where: { id: projectId }, data: { budgetAlertLevel: level } });
  if (level < project.budgetAlertLevel) return; // Re-armed, nothing to say.

  const message =
    level >= 100
      ? `${project.name} is over budget: ${logged.toFixed(2)}h logged of ${budget.toFixed(2)}h.`
      : `${project.name} has used ${Math.round((logged / budget) * 100)}% of its budget (${logged.toFixed(2)}h of ${budget.toFixed(2)}h).`;
  await notify(prisma, {
    orgId: project.orgId,
    userIds: await getOrgAdminUserIds(prisma, project.orgId),
    type: "BUDGET_ALERT",
    message,
    link: `/projects/${projectId}`,
  });
  await postToSlack(project.org.slackWebhookUrl, `:warning: ${message}`);
}

async function checkTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { project: { include: { org: { select: { slackWebhookUrl: true } } } } },
  });
  if (!task) return;
  const estimate = task.estimatedHours ? Number(task.estimatedHours) : null;
  const sum = await prisma.timeEntry.aggregate({ where: { taskId }, _sum: { hours: true } });
  const logged = Number(sum._sum.hours ?? 0);
  const over = estimate !== null && logged > estimate;

  if (!over) {
    if (task.overEstimateAlertedAt) {
      await prisma.task.update({ where: { id: taskId }, data: { overEstimateAlertedAt: null } });
    }
    return;
  }
  if (task.overEstimateAlertedAt) return;

  await prisma.task.update({ where: { id: taskId }, data: { overEstimateAlertedAt: new Date() } });
  const message = `"${task.title}" on ${task.project.name} is over its estimate: ${logged.toFixed(2)}h logged of ${estimate!.toFixed(2)}h.`;
  const admins = await getOrgAdminUserIds(prisma, task.project.orgId);
  await notify(prisma, {
    orgId: task.project.orgId,
    userIds: [...admins, ...(task.assigneeId ? [task.assigneeId] : [])],
    type: "BUDGET_ALERT",
    message,
    link: `/projects/${task.projectId}?task=${task.id}`,
  });
  await postToSlack(task.project.org.slackWebhookUrl, `:warning: ${message}`);
}
