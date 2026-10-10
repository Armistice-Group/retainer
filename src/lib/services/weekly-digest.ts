import "server-only";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { postToSlack } from "@/lib/slack";
import { alertRecipients } from "@/lib/alerts";
import { channelsFor } from "@/lib/alert-events";
import { buildReport } from "@/lib/services/reports";
import { DigestEmail, type DigestData } from "@/emails/digest-email";
import { formatCurrency, formatDate } from "@/lib/format";
import { daysOverdue } from "@/lib/invoice-aging";
import { balanceDue, isPartlyPaid } from "@/lib/invoice-balance";
import { getOrigin } from "@/lib/url";
import { toISODate } from "@/lib/date";

const DAY_MS = 86_400_000;

/** Monday 00:00 UTC of the week before `now`'s week. */
function lastWeek(now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const thisMonday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
  return { from: new Date(thisMonday.getTime() - 7 * DAY_MS), to: thisMonday };
}

/** The digest for one org covering last week (Mon–Sun). */
export async function buildDigest(orgId: string, now = new Date()): Promise<DigestData> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
  const { from, to } = lastWeek(now);
  const money = (n: number) => formatCurrency(n, org.defaultCurrency);
  const report = await buildReport(orgId, from, to);

  const [paid, sent, overdue, budgets, pendingSheets] = await Promise.all([
    // Cash received last week, part payments included, by the date it
    // arrived (in the org's currency, like the other figures).
    prisma.payment.findMany({
      where: { orgId, currency: org.defaultCurrency, receivedAt: { gte: from, lt: to } },
      select: { amount: true },
    }),
    prisma.invoice.findMany({
      where: { orgId, kind: "STANDARD", status: { in: ["SENT", "PAID"] }, issueDate: { gte: from, lt: to } },
      select: { total: true },
    }),
    prisma.invoice.findMany({
      where: { orgId, status: "SENT", dueDate: { lt: to } },
      include: { client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.project.findMany({
      where: { orgId, status: "ACTIVE", budgetAlertLevel: { gte: 80 } },
      select: { name: true, budgetAlertLevel: true, client: { select: { name: true } } },
    }),
    prisma.timesheet.count({ where: { orgId, status: "SUBMITTED" } }),
  ]);
  const sum = (rows: { total: unknown }[]) => rows.reduce((s, r) => s + Number(r.total), 0);
  const received = paid.reduce((s, p) => s + Number(p.amount), 0);
  const hours = report.people.reduce((s, p) => s + p.hours, 0);
  const billable = report.people.reduce((s, p) => s + p.billableHours, 0);
  const unbilled = report.unbilled.reduce((s, u) => s + u.total, 0);

  const sections: DigestData["sections"] = [
    {
      title: "Hours by person",
      lines: report.people
        .filter((p) => p.hours > 0)
        .map((p) => `${p.name}: ${p.hours.toFixed(1)}h (${p.billableHours.toFixed(1)}h billable)`),
      empty: "No time logged.",
    },
    {
      title: "Overdue invoices",
      lines: overdue.map(
        (i) =>
          `${i.number} · ${i.client.name} · ${money(balanceDue(i))}${isPartlyPaid(i) ? " still due (partly paid)" : ""} · ${daysOverdue(i.dueDate, to)} days (due ${formatDate(i.dueDate)})`
      ),
      empty: "Nothing overdue.",
    },
    {
      title: "Projects near or over budget",
      lines: budgets.map(
        (p) => `${p.client.name} — ${p.name}: ${p.budgetAlertLevel >= 100 ? "over budget" : "past 80%"}`
      ),
      empty: "All within budget.",
    },
  ];
  if (pendingSheets > 0) {
    sections.push({
      title: "Waiting on you",
      lines: [`${pendingSheets} timesheet${pendingSheets === 1 ? "" : "s"} to approve`],
      empty: "",
    });
  }

  const origin = await getOrigin().catch(() => "");
  return {
    orgName: org.name,
    weekLabel: formatDate(from),
    stats: [
      { label: "hours logged", value: `${hours.toFixed(1)}` },
      { label: "billable", value: `${billable.toFixed(1)}h` },
      { label: "invoiced", value: money(sum(sent)) },
      { label: "received", value: money(received) },
      { label: "not yet invoiced", value: money(unbilled) },
    ],
    sections,
    // Reports for the same week (its `to` is inclusive, so the Sunday).
    url: `${origin}/reports?from=${toISODate(from)}&to=${toISODate(new Date(to.getTime() - DAY_MS))}`,
    origin,
  };
}

/** Run from the daily job: on Monday (or Tuesday, if the daily run missed
 * Monday), each org with the digest on gets last week's summary once. */
export async function sendWeeklyDigests(now = new Date()) {
  const day = now.getUTCDay();
  if (day !== 1 && day !== 2) return { sent: 0 };
  const orgs = await prisma.organization.findMany({
    where: { OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(now.getTime() - 6 * DAY_MS) } }] },
    select: { id: true, name: true, alertSettings: true, alertEmails: true, slackWebhookUrl: true },
  });
  let sent = 0;
  for (const org of orgs) {
    const channels = channelsFor(org.alertSettings, "WEEKLY_DIGEST");
    if (!channels.email && !channels.slack) continue;
    try {
      const digest = await buildDigest(org.id, now);
      if (channels.email) {
        for (const to of await alertRecipients(org.id, org.alertEmails)) {
          await sendEmail({
            to,
            subject: `${org.name}: your week of ${digest.weekLabel}`,
            react: DigestEmail(digest),
          });
        }
      }
      if (channels.slack) {
        await postToSlack(
          org.slackWebhookUrl,
          [
            `*${org.name} — week of ${digest.weekLabel}*`,
            digest.stats.map((s) => `${s.value} ${s.label}`).join(" · "),
            ...digest.sections
              .filter((s) => s.lines.length)
              .map((s) => `*${s.title}*\n${s.lines.map((l) => `• ${l}`).join("\n")}`),
          ].join("\n")
        );
      }
      await prisma.organization.update({ where: { id: org.id }, data: { lastDigestAt: now } });
      sent++;
    } catch (err) {
      console.warn("[digest] Failed for org", org.id, err);
    }
  }
  return { sent };
}
