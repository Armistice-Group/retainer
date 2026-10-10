import "server-only";
import { randomBytes } from "crypto";
import { Prisma, type BillingType, type Role } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { projectVisibilityWhere, canViewProject } from "@/lib/project-access";
import { sendAlert } from "@/lib/alerts";
import { formatCurrency, formatDate } from "@/lib/format";
import { defaultBillRateFor } from "@/lib/bill-rates";
import {
  estimateInputSchema,
  type EstimateInput,
  type ParsedEstimateInput,
} from "@/lib/validations/estimate";

export class EstimateError extends Error {}

export type EstimateContext = {
  orgId: string;
  actorId: string;
  role: Role;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Db = Prisma.TransactionClient | typeof prisma;

/** Updates one estimate only if it still matches `where` (e.g. still a
 * draft); false if it doesn't. A single-row update, so the audit log gets a
 * proper entry, and conditional, so concurrent clicks can't both win. */
async function updateIf(db: Db, where: Prisma.EstimateWhereUniqueInput, data: Prisma.EstimateUpdateInput) {
  try {
    await db.estimate.update({ where, data });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") return false;
    throw err;
  }
}

/** Only owners and admins create, edit, send, mark and delete estimates and
 * turn them into projects — in the app, the API and the MCP server alike.
 * Members can view the ones they can see. */
export function canManageEstimates(role: Role) {
  return role === "OWNER" || role === "ADMIN";
}

function requireManager(ctx: EstimateContext) {
  if (!canManageEstimates(ctx.role)) {
    throw new EstimateError("Only owners and admins can manage estimates.");
  }
}

/**
 * Prisma `where` fragment for estimates this actor can see: all for
 * OWNER/ADMIN; otherwise every estimate not tied to a project, plus those on
 * projects they can see (so an estimate on a confidential project is only
 * visible to people on it). Clients themselves are visible to every member.
 */
export function estimateVisibilityWhere(userId: string, role: Role): Prisma.EstimateWhereInput {
  if (role === "OWNER" || role === "ADMIN") return {};
  return {
    OR: [{ projectId: null }, { project: projectVisibilityWhere(userId, role) }],
  };
}

export function visibleEstimateWhere(ctx: EstimateContext, estimateId: string): Prisma.EstimateWhereInput {
  return { id: estimateId, orgId: ctx.orgId, ...estimateVisibilityWhere(ctx.actorId, ctx.role) };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeEstimateTotals(
  lines: { quantity: number; rate: number }[],
  taxRate: number
) {
  const amounts = lines.map((l) => round2(l.quantity * l.rate));
  const subtotal = round2(amounts.reduce((s, a) => s + a, 0));
  const taxAmount = round2((subtotal * taxRate) / 100);
  return { amounts, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
}

/** Today as a UTC date-only value (how @db.Date columns come back). */
export function todayUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** An estimate can be accepted through the end of its expiry date. */
export function isPastExpiry(expiresAt: Date | null, now = new Date()) {
  return !!expiresAt && expiresAt.getTime() < todayUtc(now).getTime();
}

/** Sent estimates past their expiry date become EXPIRED. Run on read (lists,
 * the detail page, the client page) and by the daily cron, so nothing
 * depends on the scheduler running. */
export async function expireEstimates(scope: { orgId?: string; estimateId?: string } = {}, now = new Date()) {
  const { count } = await prisma.estimate.updateMany({
    where: {
      ...(scope.orgId ? { orgId: scope.orgId } : {}),
      ...(scope.estimateId ? { id: scope.estimateId } : {}),
      status: "SENT",
      expiresAt: { lt: todayUtc(now) },
    },
    data: { status: "EXPIRED" },
  });
  return count;
}

function toDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

/** Checks the client and (optional) project belong to the org, match each
 * other and are visible to the actor. */
async function resolveClientAndProject(ctx: EstimateContext, input: ParsedEstimateInput) {
  const client = await prisma.client.findFirst({ where: { id: input.clientId, orgId: ctx.orgId } });
  if (!client) throw new EstimateError("Client not found.");
  let projectId: string | null = null;
  if (input.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: input.projectId, orgId: ctx.orgId },
    });
    if (!project || !(await canViewProject(project, ctx.actorId, ctx.role))) {
      throw new EstimateError("Project not found.");
    }
    if (project.clientId !== client.id) {
      throw new EstimateError("That project belongs to a different client.");
    }
    projectId = project.id;
  }
  return { client, projectId };
}

function lineRows(input: ParsedEstimateInput) {
  const totals = computeEstimateTotals(input.lineItems, input.taxRate);
  const rows = input.lineItems.map((l, i) => ({
    description: l.description,
    quantity: round2(l.quantity),
    rate: round2(l.rate),
    amount: totals.amounts[i],
    sortOrder: i,
    isMilestone: l.isMilestone,
    milestoneDueDate: l.isMilestone && l.milestoneDueDate ? toDate(l.milestoneDueDate) : null,
    milestoneDueDays:
      l.isMilestone && !l.milestoneDueDate && l.milestoneDueDays != null ? l.milestoneDueDays : null,
  }));
  return { rows, totals };
}

function scalarFields(input: ParsedEstimateInput) {
  return {
    title: input.title,
    intro: input.intro?.trim() ? input.intro.trim() : null,
    expiresAt: input.expiresAt ? toDate(input.expiresAt) : null,
    taxRate: input.taxRate,
    proposedBillingType: input.proposedBillingType ?? null,
    proposedRate: input.proposedRate ?? null,
    proposedBudget: input.proposedBudget ?? null,
  };
}

export function parseEstimateInput(raw: unknown) {
  return estimateInputSchema.safeParse(raw);
}

/** Takes the next EST-#### number for the org inside a transaction; the
 * counter row is locked by the increment, so concurrent creates never share
 * a number (and @@unique([orgId, number]) backs that up). */
async function nextEstimateNumber(tx: Prisma.TransactionClient, orgId: string) {
  const org = await tx.organization.update({
    where: { id: orgId },
    data: { nextEstimateNumber: { increment: 1 } },
    select: { nextEstimateNumber: true },
  });
  return `EST-${String(org.nextEstimateNumber - 1).padStart(4, "0")}`;
}

export async function createEstimate(ctx: EstimateContext, raw: EstimateInput) {
  requireManager(ctx);
  const parsed = estimateInputSchema.safeParse(raw);
  if (!parsed.success) throw new EstimateError(parsed.error.issues[0]?.message ?? "Invalid estimate.");
  const input = parsed.data;
  const { client, projectId } = await resolveClientAndProject(ctx, input);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { defaultCurrency: true },
  });
  const { rows, totals } = lineRows(input);

  const created = await prisma.$transaction(async (tx) => {
    const number = await nextEstimateNumber(tx, ctx.orgId);
    return tx.estimate.create({
      data: {
        orgId: ctx.orgId,
        clientId: client.id,
        projectId,
        number,
        status: "DRAFT",
        issueDate: input.issueDate ? toDate(input.issueDate) : todayUtc(),
        currency: org.defaultCurrency,
        ...scalarFields(input),
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        lineItems: { create: rows },
      },
    });
  });
  // Read back with lines separately: a create that also includes its lines
  // would hand the audit hook a relation list it can't record.
  return prisma.estimate.findUniqueOrThrow({
    where: { id: created.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

/** Drafts only: what the client accepts is what they were sent. */
export async function updateEstimate(ctx: EstimateContext, estimateId: string, raw: EstimateInput) {
  requireManager(ctx);
  const existing = await prisma.estimate.findFirst({ where: visibleEstimateWhere(ctx, estimateId) });
  if (!existing) throw new EstimateError("Estimate not found.");
  if (existing.status !== "DRAFT") throw new EstimateError("Only draft estimates can be edited.");
  const parsed = estimateInputSchema.safeParse(raw);
  if (!parsed.success) throw new EstimateError(parsed.error.issues[0]?.message ?? "Invalid estimate.");
  const input = parsed.data;
  const { client, projectId } = await resolveClientAndProject(ctx, input);
  const { rows, totals } = lineRows(input);

  // Conditional on still being a draft, so a send can't slip in between.
  const updated = await updateIf(
    prisma,
    { id: estimateId, status: "DRAFT" },
    {
      client: { connect: { id: client.id } },
      project: projectId ? { connect: { id: projectId } } : { disconnect: true },
      issueDate: input.issueDate ? toDate(input.issueDate) : existing.issueDate,
      ...scalarFields(input),
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      lineItems: { deleteMany: {}, create: rows },
    }
  );
  if (!updated) throw new EstimateError("Only draft estimates can be edited.");
  return prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

/** A new draft with the same client, project, text, lines and proposed
 * billing; issued today, with the same validity window as the original. */
export async function duplicateEstimate(ctx: EstimateContext, estimateId: string) {
  requireManager(ctx);
  const source = await prisma.estimate.findFirst({
    where: visibleEstimateWhere(ctx, estimateId),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new EstimateError("Estimate not found.");
  const issueDate = todayUtc();
  const expiresAt = source.expiresAt
    ? new Date(issueDate.getTime() + Math.max(0, source.expiresAt.getTime() - source.issueDate.getTime()))
    : null;
  // A project created from the source belongs to that estimate; the copy
  // only keeps a project the source was written for.
  const keepProject = source.projectId && !source.projectCreatedAt;

  return prisma.$transaction(async (tx) => {
    const number = await nextEstimateNumber(tx, ctx.orgId);
    return tx.estimate.create({
      data: {
        orgId: ctx.orgId,
        clientId: source.clientId,
        projectId: keepProject ? source.projectId : null,
        number,
        status: "DRAFT",
        title: source.title,
        intro: source.intro,
        issueDate,
        expiresAt,
        currency: source.currency,
        taxRate: source.taxRate,
        subtotal: source.subtotal,
        taxAmount: source.taxAmount,
        total: source.total,
        proposedBillingType: source.proposedBillingType,
        proposedRate: source.proposedRate,
        proposedBudget: source.proposedBudget,
        lineItems: {
          create: source.lineItems.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            rate: l.rate,
            amount: l.amount,
            sortOrder: l.sortOrder,
            isMilestone: l.isMilestone,
            milestoneDueDate: l.milestoneDueDate,
            milestoneDueDays: l.milestoneDueDays,
          })),
        },
      },
    });
  });
}

export async function deleteEstimate(ctx: EstimateContext, estimateId: string) {
  requireManager(ctx);
  const existing = await prisma.estimate.findFirst({ where: visibleEstimateWhere(ctx, estimateId) });
  if (!existing) throw new EstimateError("Estimate not found.");
  if (existing.status !== "DRAFT") throw new EstimateError("Only draft estimates can be deleted.");
  try {
    await prisma.estimate.delete({ where: { id: estimateId, status: "DRAFT" } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      throw new EstimateError("Only draft estimates can be deleted.");
    }
    throw err;
  }
}

/** The estimate's client link token, created on first use. */
export async function ensureEstimateToken(estimateId: string) {
  const estimate = await prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    select: { viewToken: true },
  });
  if (estimate.viewToken) return estimate.viewToken;
  const token = randomBytes(24).toString("base64url");
  // Conditional so two concurrent first uses agree on one token.
  await prisma.estimate.updateMany({ where: { id: estimateId, viewToken: null }, data: { viewToken: token } });
  const after = await prisma.estimate.findUniqueOrThrow({
    where: { id: estimateId },
    select: { viewToken: true },
  });
  return after.viewToken!;
}

export async function estimateClientUrl(estimateId: string) {
  const token = await ensureEstimateToken(estimateId);
  const { getOrigin } = await import("@/lib/url");
  return `${await getOrigin()}/e/${token}`;
}

function sendableError(estimate: { status: string; expiresAt: Date | null; _count: { lineItems: number } }) {
  if (estimate.status !== "DRAFT" && estimate.status !== "SENT") {
    return `This estimate is ${estimate.status.toLowerCase()} and can't be sent.`;
  }
  if (estimate._count.lineItems === 0) return "Add at least one line item before sending.";
  if (isPastExpiry(estimate.expiresAt)) {
    return "This estimate's expiry date has passed. Duplicate it, or edit the draft's expiry date, before sending.";
  }
  return null;
}

/** Marks a draft sent (for "Copy client link", where you send it yourself)
 * and returns the client link. A sent estimate just returns its link. */
export async function markEstimateSent(ctx: EstimateContext, estimateId: string) {
  requireManager(ctx);
  const estimate = await prisma.estimate.findFirst({
    where: visibleEstimateWhere(ctx, estimateId),
    include: { _count: { select: { lineItems: true } } },
  });
  if (!estimate) throw new EstimateError("Estimate not found.");
  const error = sendableError(estimate);
  if (error) throw new EstimateError(error);
  const url = await estimateClientUrl(estimate.id);
  if (estimate.status === "DRAFT") {
    await updateIf(prisma, { id: estimate.id, status: "DRAFT" }, { status: "SENT", sentAt: new Date() });
  }
  return { url };
}

/** Where an estimate email goes by default: the client's primary contacts
 * with an email, else all its contacts with one, else its main email. */
export async function defaultEstimateRecipients(clientId: string) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { contacts: { where: { email: { not: null } }, orderBy: { createdAt: "asc" } } },
  });
  const primary = client.contacts.filter((c) => c.isPrimary).map((c) => c.email!.toLowerCase());
  if (primary.length) return [...new Set(primary)];
  const all = client.contacts.map((c) => c.email!.toLowerCase());
  if (all.length) return [...new Set(all)];
  return client.email ? [client.email.toLowerCase()] : [];
}

/** The client's contacts with an email, for the send dialog. */
export async function estimateContactOptions(clientId: string) {
  const contacts = await prisma.contact.findMany({
    where: { clientId, email: { not: null } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { name: true, email: true },
  });
  return contacts.map((c) => ({ name: c.name, email: c.email!.toLowerCase() }));
}

/** Emails the client a link to view, accept or decline the estimate. A
 * draft is marked sent. */
export async function emailEstimate(
  ctx: EstimateContext,
  estimateId: string,
  input: { to: string[]; message?: string | null }
) {
  requireManager(ctx);
  const estimate = await prisma.estimate.findFirst({
    where: visibleEstimateWhere(ctx, estimateId),
    include: { org: true, _count: { select: { lineItems: true } } },
  });
  if (!estimate) throw new EstimateError("Estimate not found.");
  const error = sendableError(estimate);
  if (error) throw new EstimateError(error);

  const { isEmailConfigured, sendEmail } = await import("@/lib/email");
  if (!(await isEmailConfigured())) {
    throw new EstimateError(
      "Email isn't set up on this instance. Copy the client link instead, or set up email under Settings → Integrations."
    );
  }
  const to = [...new Set(input.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (to.length === 0) throw new EstimateError("Add at least one recipient.");
  const bad = to.find((e) => !EMAIL_RE.test(e));
  if (bad) throw new EstimateError(`"${bad}" isn't an email address.`);
  if (to.length > 20) throw new EstimateError("Send to at most 20 people at once.");

  const [{ EstimateEmail }, { orgLogoUrl }, { getOrigin }] = await Promise.all([
    import("@/emails/estimate-email"),
    import("@/lib/branding"),
    import("@/lib/url"),
  ]);
  const actor = await prisma.user.findUnique({ where: { id: ctx.actorId }, select: { email: true } });
  const viewUrl = await estimateClientUrl(estimate.id);
  const origin = await getOrigin();
  const logo = orgLogoUrl(estimate.org);
  const total = formatCurrency(estimate.total, estimate.currency);

  const sent: string[] = [];
  for (const recipient of to) {
    const ok = await sendEmail({
      to: recipient,
      subject: `Estimate ${estimate.number} from ${estimate.org.name}: ${estimate.title}`.slice(0, 200),
      replyTo: actor?.email ?? undefined,
      react: EstimateEmail({
        orgName: estimate.org.name,
        logoUrl: logo ? (logo.startsWith("/") ? `${origin}${logo}` : logo) : null,
        estimateNumber: estimate.number,
        title: estimate.title,
        total,
        expiresAt: estimate.expiresAt ? formatDate(estimate.expiresAt) : null,
        message: input.message?.trim() || null,
        viewUrl,
      }),
    });
    if (ok) sent.push(recipient);
  }
  if (sent.length === 0) throw new EstimateError("The email couldn't be sent. Try again.");

  await updateIf(prisma, { id: estimate.id, status: "DRAFT" }, { status: "SENT", sentAt: new Date() });
  return { sent };
}

/** A client-visible estimate by its link token (never drafts). Expires it
 * first if its date has passed. Only what the client page needs. */
export async function getEstimateByViewToken(token: string) {
  if (!token || token.length > 64 || !/^[A-Za-z0-9_-]+$/.test(token)) return null;
  const found = await prisma.estimate.findUnique({ where: { viewToken: token }, select: { id: true } });
  if (!found) return null;
  await expireEstimates({ estimateId: found.id });
  const estimate = await prisma.estimate.findUnique({
    where: { id: found.id },
    select: {
      id: true,
      number: true,
      title: true,
      intro: true,
      status: true,
      issueDate: true,
      expiresAt: true,
      currency: true,
      subtotal: true,
      taxRate: true,
      taxAmount: true,
      total: true,
      respondedAt: true,
      responderName: true,
      orgId: true,
      client: { select: { name: true } },
      org: {
        select: {
          id: true,
          name: true,
          logoData: true,
          logoUrl: true,
          logoContentType: true,
          brandColor: true,
        },
      },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          description: true,
          quantity: true,
          rate: true,
          amount: true,
          isMilestone: true,
        },
      },
    },
  });
  if (!estimate || estimate.status === "DRAFT") return null;
  return estimate;
}

export type ClientEstimate = NonNullable<Awaited<ReturnType<typeof getEstimateByViewToken>>>;

type ResponseMeta = { ipAddress: string | null; userAgent: string | null };

async function alertResponse(
  estimate: { id: string; orgId: string; number: string; title: string; total: Prisma.Decimal; currency: string; client: { name: string } },
  decision: "ACCEPTED" | "DECLINED",
  who: string,
  note: string | null,
  excludeUserId: string | null
) {
  const verb = decision === "ACCEPTED" ? "accepted" : "declined";
  await sendAlert({
    orgId: estimate.orgId,
    event: decision === "ACCEPTED" ? "ESTIMATE_ACCEPTED" : "ESTIMATE_DECLINED",
    message: `${estimate.client.name} ${verb} estimate ${estimate.number} "${estimate.title}" (${formatCurrency(estimate.total, estimate.currency)}).`,
    link: `/estimates/${estimate.id}`,
    details: [`By ${who}`, ...(note ? [`Note: ${note}`] : [])],
    excludeUserId,
  });
}

/** The client accepting or declining on the estimate's page. Idempotent: the
 * status only changes from SENT (and before expiry), conditionally in one
 * update, so a double click or a replayed request records one response and
 * sends one alert. Returns the estimate's resulting status. */
export async function respondToEstimate(
  token: string,
  input: { decision: "ACCEPT" | "DECLINE"; name: string; note?: string | null },
  meta: ResponseMeta,
  now = new Date()
): Promise<{ status: string; changed: boolean }> {
  const estimate = await getEstimateByViewToken(token);
  if (!estimate) throw new EstimateError("This estimate link isn't valid.");
  const name = input.name.trim().slice(0, 200);
  if (!name) throw new EstimateError("Enter your name.");
  const note = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;
  const status = input.decision === "ACCEPT" ? "ACCEPTED" : "DECLINED";

  const changed = await updateIf(
    prisma,
    {
      id: estimate.id,
      status: "SENT",
      OR: [{ expiresAt: null }, { expiresAt: { gte: todayUtc(now) } }],
    },
    {
      status,
      respondedAt: now,
      responderName: name,
      responseNote: note,
      responseIp: meta.ipAddress?.slice(0, 100) ?? null,
      responseUserAgent: meta.userAgent?.slice(0, 300) ?? null,
      respondedBy: { disconnect: true },
    }
  );
  if (!changed) {
    const current = await prisma.estimate.findUniqueOrThrow({
      where: { id: estimate.id },
      select: { status: true },
    });
    return { status: current.status, changed: false };
  }
  await alertResponse({ ...estimate, client: estimate.client }, status, name, note, null);
  return { status, changed: true };
}

/** Someone in the org recording the client's answer by hand (they accepted
 * by email or on a call). Works on drafts, sent and expired estimates. */
export async function markEstimateResponse(
  ctx: EstimateContext,
  estimateId: string,
  decision: "ACCEPTED" | "DECLINED",
  input: { name?: string | null; note?: string | null } = {}
) {
  requireManager(ctx);
  const estimate = await prisma.estimate.findFirst({
    where: visibleEstimateWhere(ctx, estimateId),
    include: { client: { select: { name: true } } },
  });
  if (!estimate) throw new EstimateError("Estimate not found.");
  if (estimate.status === "ACCEPTED" || estimate.status === "DECLINED") {
    throw new EstimateError(`This estimate was already ${estimate.status.toLowerCase()}.`);
  }
  const actor = await prisma.user.findUnique({ where: { id: ctx.actorId }, select: { name: true } });
  const name = input.name?.trim().slice(0, 200) || null;
  const note = input.note?.trim() ? input.note.trim().slice(0, 2000) : null;
  const changed = await updateIf(
    prisma,
    { id: estimate.id, status: estimate.status },
    {
      status: decision,
      respondedAt: new Date(),
      responderName: name,
      responseNote: note,
      responseIp: null,
      responseUserAgent: null,
      respondedBy: { connect: { id: ctx.actorId } },
    }
  );
  if (!changed) throw new EstimateError("This estimate changed while saving. Reload and try again.");
  await alertResponse(
    estimate,
    decision,
    `${actor?.name ?? "a team member"} (marked by hand${name ? ` for ${name}` : ""})`,
    note,
    ctx.actorId
  );
  return prisma.estimate.findUniqueOrThrow({ where: { id: estimate.id } });
}

/** What a project created from this estimate gets. */
export function projectPlanFor(estimate: {
  subtotal: Prisma.Decimal | number;
  proposedBillingType: BillingType | null;
  proposedRate: Prisma.Decimal | number | null;
  proposedBudget: Prisma.Decimal | number | null;
  lineItems: { isMilestone: boolean }[];
}) {
  const hasMilestones = estimate.lineItems.some((l) => l.isMilestone);
  const billingType: BillingType =
    estimate.proposedBillingType ?? (hasMilestones ? "MILESTONE" : "FLAT_FEE");
  const budget = round2(Number(estimate.proposedBudget ?? estimate.subtotal));
  const rate = estimate.proposedRate != null ? Number(estimate.proposedRate) : null;
  const budgetHours =
    billingType === "HOURLY" && rate && rate > 0 ? Math.min(round2(budget / rate), 99999.99) : null;
  return {
    billingType,
    budget,
    rate,
    flatFeeAmount: billingType === "FLAT_FEE" && budget > 0 ? budget : null,
    budgetHours: budgetHours && budgetHours > 0 ? budgetHours : null,
    // Milestones are billed on their own, so they only go on a
    // milestone-based project (anything else would bill the work twice).
    createsMilestones: billingType === "MILESTONE" && hasMilestones,
  };
}

/** Creates the project an accepted estimate describes: named after its
 * title, for its client, with the proposed (or derived) billing type and
 * budget, and a milestone per line flagged as one. Links the estimate to
 * it. Once per estimate. */
export async function createProjectFromEstimate(ctx: EstimateContext, estimateId: string) {
  requireManager(ctx);
  const estimate = await prisma.estimate.findFirst({
    where: visibleEstimateWhere(ctx, estimateId),
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) throw new EstimateError("Estimate not found.");
  if (estimate.status !== "ACCEPTED") {
    throw new EstimateError("Only accepted estimates can be turned into a project.");
  }
  if (estimate.projectId) throw new EstimateError("This estimate is already linked to a project.");

  const plan = projectPlanFor(estimate);
  const acceptedAt = estimate.respondedAt ?? new Date();
  const acceptedDay = todayUtc(acceptedAt);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: { defaultCurrency: true, _count: { select: { memberships: true } } },
  });
  // Same as creating a project by hand: a solo org's only member goes on
  // every project, at the proposed rate if there is one.
  const soloMemberRate =
    org._count.memberships === 1
      ? (plan.rate ?? (await defaultBillRateFor(ctx.orgId, ctx.actorId)))
      : null;

  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        orgId: ctx.orgId,
        clientId: estimate.clientId,
        name: estimate.title.slice(0, 200),
        description: `From estimate ${estimate.number}.`,
        status: "ACTIVE",
        billingType: plan.billingType,
        flatFeeAmount: plan.flatFeeAmount,
        budgetHours: plan.budgetHours,
      },
    });
    // Conditional, so two clicks can't both create a project (the loser's
    // transaction, project included, rolls back).
    const linked = await updateIf(
      tx,
      { id: estimate.id, projectId: null, status: "ACCEPTED" },
      { project: { connect: { id: project.id } }, projectCreatedAt: new Date() }
    );
    if (!linked) throw new EstimateError("This estimate is already linked to a project.");

    if (plan.createsMilestones) {
      let sortOrder = 0;
      for (const line of estimate.lineItems.filter((l) => l.isMilestone)) {
        const dueDate =
          line.milestoneDueDate ??
          (line.milestoneDueDays != null
            ? new Date(acceptedDay.getTime() + line.milestoneDueDays * 86_400_000)
            : null);
        await tx.milestone.create({
          data: {
            projectId: project.id,
            name: line.description.slice(0, 200),
            amount: line.amount,
            dueDate,
            sortOrder: sortOrder++,
          },
        });
      }
    }
    if (soloMemberRate != null) {
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: ctx.actorId,
          billRate: soloMemberRate,
          currency: org.defaultCurrency,
        },
      });
    }
    return project;
  });
}

/** An estimate as the API and MCP server return it: never the client-link
 * token, and the acceptance IP/user agent only for owners and admins. */
export function estimateForApi<T extends { viewToken: string | null; responseIp: string | null; responseUserAgent: string | null }>(
  estimate: T,
  role: Role
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { viewToken, responseIp, responseUserAgent, ...rest } = estimate;
  return canManageEstimates(role) ? { ...rest, responseIp, responseUserAgent } : rest;
}

export const ESTIMATE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"] as const;
