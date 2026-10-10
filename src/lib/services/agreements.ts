import "server-only";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { storeFile } from "@/lib/file-storage";
import { isPublicEmailDomain } from "@/lib/free-email-domains";
import { projectVisibilityWhere } from "@/lib/project-access";
import { recordAuditEvent } from "@/lib/audit";
import {
  AgreementProviderError,
  checkDocumenso,
  checkIronclad,
  downloadSignedPdf,
  fetchAgreement,
  listCompletedAgreements,
} from "@/lib/integrations/agreements/providers";
import {
  AGREEMENT_PROVIDER_LABELS,
  type AgreementProviderId,
  type PulledAgreement,
  type Signer,
} from "@/lib/integrations/agreements/parse";
import { emailDomain, suggestClient, type MatchClient } from "@/lib/integrations/agreements/matching";
import { detectAgreementUrl } from "@/lib/integrations/agreements/detect";
import type { AgreementConnection, Prisma, Role } from "@/generated/prisma/client";

// Signed agreements pulled from DocuSign, Documenso and Ironclad. One-way and
// read-only: completed agreements come in (hourly, or on "Sync now"), land
// unmatched in the Agreements inbox with a suggested client, and an owner or
// admin links each to a client (and optionally a project) or dismisses it.
// Syncs refresh what the provider says (title, signers, date) but never undo
// a link or a dismissal.

export class AgreementError extends Error {}

export type AgreementActor = { orgId: string; actorId: string; role: Role };

/** Re-pull this much before the last cursor, in case of clock skew or late
 * indexing at the provider. Upserts make the overlap harmless. */
const CURSOR_OVERLAP_MS = 24 * 60 * 60 * 1000;

function requireAdmin(actor: AgreementActor) {
  if (actor.role !== "OWNER" && actor.role !== "ADMIN") {
    throw new AgreementError("Only owners and admins can do that.");
  }
}

// ── Connections ─────────────────────────────────────────────────────────────

export async function connectDocumenso(actor: AgreementActor, input: { baseUrl: string; apiKey: string }) {
  requireAdmin(actor);
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new AgreementError("Paste a Documenso API key.");
  let base: string;
  try {
    base = await checkDocumenso(input.baseUrl.trim() || "https://app.documenso.com", apiKey);
  } catch (err) {
    if (err instanceof AgreementProviderError) throw new AgreementError(`Couldn't connect: ${err.message}`);
    throw err;
  }
  const data = {
    baseUrl: base,
    accountName: new URL(base).host,
    accessToken: encrypt(apiKey),
    connectedById: actor.actorId,
    lastError: null,
  };
  await saveConnection(actor.orgId, "DOCUMENSO", data);
}

export async function connectIronclad(
  actor: AgreementActor,
  input: { region: string; clientId: string; clientSecret: string; actAsEmail: string }
) {
  requireAdmin(actor);
  const region = ["na1", "eu1", "demo"].includes(input.region) ? input.region : "na1";
  const clientId = input.clientId.trim();
  const clientSecret = input.clientSecret.trim();
  const actAsEmail = input.actAsEmail.trim().toLowerCase();
  if (!clientId || !clientSecret) throw new AgreementError("Paste the client ID and client secret.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actAsEmail)) {
    throw new AgreementError("Enter the email of the Ironclad user the API reads as.");
  }
  let checked;
  try {
    checked = await checkIronclad({ region, clientId, clientSecret, actAsEmail });
  } catch (err) {
    if (err instanceof AgreementProviderError) throw new AgreementError(`Couldn't connect: ${err.message}`);
    throw err;
  }
  const data = {
    accountId: region,
    accountName: checked.host,
    baseUrl: `https://${checked.host}`,
    clientId,
    clientSecret: encrypt(clientSecret),
    actAsEmail,
    accessToken: encrypt(checked.token.accessToken),
    accessTokenExpiresAt: checked.token.expiresAt,
    connectedById: actor.actorId,
    lastError: null,
  };
  await saveConnection(actor.orgId, "IRONCLAD", data);
}

/** Creates or replaces a connection; pointing it at a different instance or
 * region starts the sync history over. */
async function saveConnection(
  orgId: string,
  provider: AgreementProviderId,
  data: Omit<Prisma.AgreementConnectionUncheckedCreateInput, "orgId" | "provider">
) {
  const where = { orgId_provider: { orgId, provider } };
  const existing = await prisma.agreementConnection.findUnique({ where, select: { baseUrl: true } });
  await prisma.agreementConnection.upsert({
    where,
    create: { orgId, provider, ...data },
    update: { ...data, ...(existing && existing.baseUrl !== data.baseUrl ? { syncCursor: null } : {}) },
  });
}

/** Removes the connection. Agreements already pulled stay. */
export async function disconnectAgreementProvider(actor: AgreementActor, provider: string) {
  requireAdmin(actor);
  await prisma.agreementConnection.deleteMany({ where: { orgId: actor.orgId, provider } });
}

// ── Matching ────────────────────────────────────────────────────────────────

export type MatchingContext = { clients: MatchClient[]; ownDomains: string[] };

export async function matchingContext(orgId: string): Promise<MatchingContext> {
  const [org, clients, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { domain: true } }),
    prisma.client.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        website: true,
        email: true,
        billingEmail: true,
        contacts: { select: { email: true } },
      },
    }),
    prisma.membership.findMany({ where: { orgId }, select: { user: { select: { email: true } } } }),
  ]);
  const ownDomains = new Set<string>();
  if (org?.domain) ownDomains.add(org.domain.toLowerCase());
  for (const m of members) {
    const d = emailDomain(m.user.email);
    if (d && !isPublicEmailDomain(d)) ownDomains.add(d);
  }
  return {
    ownDomains: [...ownDomains],
    clients: clients.map((c) => ({
      id: c.id,
      name: c.name,
      website: c.website,
      emails: [c.email, c.billingEmail, ...c.contacts.map((x) => x.email)].filter((e): e is string => !!e),
    })),
  };
}

// ── Sync ────────────────────────────────────────────────────────────────────

function signersJson(signers: Signer[]) {
  return signers.map((s) => ({ name: s.name, email: s.email })) as Prisma.InputJsonValue;
}

/** Creates or refreshes one agreement. Never touches its client link or
 * dismissal; re-suggests a client only while it's still in the inbox. */
export async function upsertPulledAgreement(
  conn: Pick<AgreementConnection, "orgId" | "provider">,
  item: PulledAgreement,
  matching: MatchingContext
) {
  const key = { orgId: conn.orgId, provider: conn.provider, externalId: item.externalId };
  const existing = await prisma.agreement.findUnique({
    where: { orgId_provider_externalId: key },
    select: { id: true, clientId: true, dismissedAt: true, suggestedClientId: true },
  });
  const fields = {
    title: item.title,
    status: item.status,
    signedAt: item.signedAt,
    signers: signersJson(item.signers),
    externalUrl: item.externalUrl,
  };
  const suggestion =
    existing?.clientId || existing?.dismissedAt
      ? (existing.suggestedClientId ?? null)
      : suggestClient(item.signers, matching.clients, {
          ownDomains: matching.ownDomains,
          counterparty: item.counterparty,
        });
  if (existing) {
    const agreement = await prisma.agreement.update({
      where: { id: existing.id },
      data: { ...fields, suggestedClientId: suggestion },
    });
    return { agreement, created: false };
  }
  const agreement = await prisma.agreement.create({
    data: { ...key, ...fields, suggestedClientId: suggestion },
  });
  return { agreement, created: true };
}

const isPdf = (bytes: Uint8Array) =>
  bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF

/** Downloads and stores the signed PDF if it isn't cached yet. Best effort. */
async function cacheSignedPdf(conn: AgreementConnection, agreementId: string, item: PulledAgreement) {
  const agreement = await prisma.agreement.findUnique({
    where: { id: agreementId },
    select: { sizeBytes: true, clientId: true },
  });
  if (!agreement || agreement.sizeBytes !== null) return;
  try {
    const bytes = await downloadSignedPdf(conn, item);
    if (!bytes || !isPdf(bytes)) return;
    const fileName = `${item.title.replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 150) || "Agreement"}.pdf`;
    const stored = await storeFile(bytes, {
      contentType: "application/pdf",
      keyPrefix: `orgs/${conn.orgId}/agreements`,
      fileName,
    });
    await prisma.agreement.update({
      where: { id: agreementId },
      data: { ...stored, fileName, contentType: "application/pdf", sizeBytes: bytes.length },
    });
    if (agreement.clientId) {
      const { fileAgreement } = await import("@/lib/services/filing");
      await fileAgreement(agreementId);
    }
  } catch (err) {
    console.warn("[agreements] Couldn't cache the signed PDF", conn.provider, item.externalId, err);
  }
}

export type SyncResult = { provider: string; pulled: number; created: number; error: string | null };

export async function syncAgreementConnection(connectionId: string): Promise<SyncResult> {
  const conn = await prisma.agreementConnection.findUnique({ where: { id: connectionId } });
  if (!conn) return { provider: "", pulled: 0, created: 0, error: "Not connected." };
  const since = conn.syncCursor ? new Date(conn.syncCursor.getTime() - CURSOR_OVERLAP_MS) : null;
  try {
    const items = await listCompletedAgreements(conn, since);
    const matching = await matchingContext(conn.orgId);
    let created = 0;
    let cursor = conn.syncCursor;
    for (const item of items) {
      const result = await upsertPulledAgreement(conn, item, matching);
      if (result.created) created++;
      await cacheSignedPdf(conn, result.agreement.id, item);
      const changed = item.changedAt ?? item.signedAt;
      if (changed && (!cursor || changed > cursor)) cursor = changed;
    }
    await prisma.agreementConnection.update({
      where: { id: conn.id },
      data: { syncCursor: cursor, lastSyncedAt: new Date(), lastError: null },
    });
    return { provider: conn.provider, pulled: items.length, created, error: null };
  } catch (err) {
    const message =
      err instanceof AgreementProviderError
        ? err.message
        : `Sync failed: ${err instanceof Error ? err.message : "unknown error"}`;
    if (!(err instanceof AgreementProviderError)) console.warn("[agreements]", conn.provider, err);
    await prisma.agreementConnection.update({
      where: { id: conn.id },
      data: { lastError: message.slice(0, 300), lastSyncedAt: new Date() },
    });
    return { provider: conn.provider, pulled: 0, created: 0, error: message };
  }
}

/** "Sync now" for one org. */
export async function syncOrgAgreements(actor: AgreementActor) {
  requireAdmin(actor);
  const connections = await prisma.agreementConnection.findMany({ where: { orgId: actor.orgId }, select: { id: true } });
  const results: SyncResult[] = [];
  for (const c of connections) results.push(await syncAgreementConnection(c.id));
  return results;
}

/** Hourly job: every connection in every org. */
export async function syncAllAgreements() {
  const connections = await prisma.agreementConnection.findMany({ select: { id: true } });
  let pulled = 0;
  let failed = 0;
  for (const c of connections) {
    const result = await syncAgreementConnection(c.id);
    pulled += result.pulled;
    if (result.error) failed++;
  }
  return { connections: connections.length, pulled, failed };
}

// ── Linking ─────────────────────────────────────────────────────────────────

async function ownAgreement(actor: AgreementActor, agreementId: string) {
  const agreement = await prisma.agreement.findUnique({ where: { id: agreementId } });
  if (!agreement || agreement.orgId !== actor.orgId) throw new AgreementError("Agreement not found.");
  return agreement;
}

async function checkTarget(orgId: string, clientId: string, projectId: string | null) {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { orgId: true, name: true } });
  if (!client || client.orgId !== orgId) throw new AgreementError("Client not found.");
  if (projectId) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (!project || project.clientId !== clientId) throw new AgreementError("Project not found.");
  }
  return client;
}

export async function linkAgreement(
  actor: AgreementActor,
  agreementId: string,
  target: { clientId: string; projectId?: string | null }
) {
  requireAdmin(actor);
  const agreement = await ownAgreement(actor, agreementId);
  const projectId = target.projectId || null;
  await checkTarget(actor.orgId, target.clientId, projectId);
  const updated = await prisma.agreement.update({
    where: { id: agreement.id },
    data: {
      clientId: target.clientId,
      projectId,
      linkedAt: new Date(),
      linkedById: actor.actorId,
      dismissedAt: null,
      dismissedById: null,
    },
  });
  const { fileAgreement } = await import("@/lib/services/filing");
  await fileAgreement(updated.id);
  return { before: agreement, after: updated };
}

/** Back to the inbox. */
export async function unlinkAgreement(actor: AgreementActor, agreementId: string) {
  requireAdmin(actor);
  const agreement = await ownAgreement(actor, agreementId);
  await prisma.agreement.update({
    where: { id: agreement.id },
    data: { clientId: null, projectId: null, linkedAt: null, linkedById: null },
  });
  return agreement;
}

/** Out of the inbox for good (syncs keep it dismissed) — or back in. */
export async function setAgreementDismissed(actor: AgreementActor, agreementId: string, dismissed: boolean) {
  requireAdmin(actor);
  const agreement = await ownAgreement(actor, agreementId);
  if (dismissed && agreement.clientId) throw new AgreementError("Unlink it from its client first.");
  await prisma.agreement.update({
    where: { id: agreement.id },
    data: dismissed
      ? { dismissedAt: new Date(), dismissedById: actor.actorId }
      : { dismissedAt: null, dismissedById: null },
  });
  return agreement;
}

/** The org's self-hosted Documenso host, to recognize its links. */
async function documensoHosts(orgId: string) {
  const conn = await prisma.agreementConnection.findUnique({
    where: { orgId_provider: { orgId, provider: "DOCUMENSO" } },
    select: { baseUrl: true },
  });
  try {
    return conn?.baseUrl ? [new URL(conn.baseUrl).hostname] : [];
  } catch {
    return [];
  }
}

/** Whether a pasted URL points at a signed agreement this org can pull. */
export async function detectOrgAgreementUrl(orgId: string, url: string) {
  return detectAgreementUrl(url, await documensoHosts(orgId));
}

/** Add document → paste a DocuSign/Documenso/Ironclad link: pull that one
 * agreement now and link it to the client (and project). */
export async function linkAgreementFromUrl(
  actor: AgreementActor,
  url: string,
  target: { clientId: string; projectId?: string | null }
) {
  requireAdmin(actor);
  const detected = await detectOrgAgreementUrl(actor.orgId, url);
  if (!detected) throw new AgreementError("That isn't a DocuSign, Documenso or Ironclad agreement link.");
  const label = AGREEMENT_PROVIDER_LABELS[detected.provider];
  await checkTarget(actor.orgId, target.clientId, target.projectId || null);
  const conn = await prisma.agreementConnection.findUnique({
    where: { orgId_provider: { orgId: actor.orgId, provider: detected.provider } },
  });
  if (!conn) throw new AgreementError(`Connect ${label} under Settings → Agreements first.`);
  let item: PulledAgreement | null;
  try {
    item = await fetchAgreement(conn, detected.externalId);
  } catch (err) {
    if (err instanceof AgreementProviderError) throw new AgreementError(`Couldn't get it from ${label}: ${err.message}`);
    throw err;
  }
  if (!item) {
    throw new AgreementError(`${label} doesn't have a completed agreement at that link that this connection can see.`);
  }
  const { agreement } = await upsertPulledAgreement(conn, item, await matchingContext(actor.orgId));
  await cacheSignedPdf(conn, agreement.id, item);
  return linkAgreement(actor, agreement.id, target);
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** Agreements a viewer may see on a client (all of its projects' too) or one
 * project: anyone who can see the client sees client-level ones; a
 * confidential project's follow the project's visibility. */
export function agreementVisibilityWhere(
  viewer: { userId: string; role: Role },
  scope: { orgId: string; clientId: string; projectId?: string }
): Prisma.AgreementWhereInput {
  return {
    orgId: scope.orgId,
    clientId: scope.clientId,
    ...(scope.projectId ? { projectId: scope.projectId } : {}),
    ...(viewer.role === "OWNER" || viewer.role === "ADMIN"
      ? {}
      : {
          OR: [{ projectId: null }, { project: { is: projectVisibilityWhere(viewer.userId, viewer.role) } }],
        }),
  };
}

export type AgreementItem = {
  id: string;
  provider: string;
  providerLabel: string;
  title: string;
  status: string;
  signedAt: string | null;
  signers: Signer[];
  externalUrl: string | null;
  hasFile: boolean;
  projectName: string | null;
  projectId: string | null;
};

function readSigners(value: Prisma.JsonValue): Signer[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((s) =>
    s && typeof s === "object" && !Array.isArray(s)
      ? [{ name: typeof s.name === "string" ? s.name : null, email: typeof s.email === "string" ? s.email : null }]
      : []
  );
}

const itemSelect = {
  id: true,
  provider: true,
  title: true,
  status: true,
  signedAt: true,
  signers: true,
  externalUrl: true,
  sizeBytes: true,
  projectId: true,
  project: { select: { name: true } },
} as const;

function toItem(a: Prisma.AgreementGetPayload<{ select: typeof itemSelect }>): AgreementItem {
  return {
    id: a.id,
    provider: a.provider,
    providerLabel: AGREEMENT_PROVIDER_LABELS[a.provider as AgreementProviderId] ?? a.provider,
    title: a.title,
    status: a.status,
    signedAt: a.signedAt?.toISOString() ?? null,
    signers: readSigners(a.signers),
    externalUrl: a.externalUrl,
    hasFile: a.sizeBytes !== null,
    projectId: a.projectId,
    projectName: a.project?.name ?? null,
  };
}

export async function visibleAgreements(
  viewer: { orgId: string; userId: string; role: Role },
  scope: { clientId: string; projectId?: string }
) {
  const rows = await prisma.agreement.findMany({
    where: agreementVisibilityWhere(viewer, { orgId: viewer.orgId, ...scope }),
    orderBy: [{ signedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    select: itemSelect,
  });
  return rows.map(toItem);
}

/** Owners/admins: the inbox, what was dismissed, and what to link to. */
export async function agreementsInbox(actor: AgreementActor) {
  requireAdmin(actor);
  const [unmatched, dismissed, clients, linkedCount] = await Promise.all([
    prisma.agreement.findMany({
      where: { orgId: actor.orgId, clientId: null, dismissedAt: null },
      orderBy: [{ signedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: { ...itemSelect, suggestedClientId: true },
      take: 200,
    }),
    prisma.agreement.findMany({
      where: { orgId: actor.orgId, clientId: null, dismissedAt: { not: null } },
      orderBy: { dismissedAt: "desc" },
      select: itemSelect,
      take: 50,
    }),
    prisma.client.findMany({
      where: { orgId: actor.orgId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, projects: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
    }),
    prisma.agreement.count({ where: { orgId: actor.orgId, clientId: { not: null } } }),
  ]);
  const clientIds = new Set(clients.map((c) => c.id));
  return {
    unmatched: unmatched.map((a) => ({
      ...toItem(a),
      suggestedClientId: a.suggestedClientId && clientIds.has(a.suggestedClientId) ? a.suggestedClientId : null,
    })),
    dismissed: dismissed.map(toItem),
    clients,
    linkedCount,
  };
}

/** The cached PDF, if the viewer may see this agreement. */
export async function agreementFileFor(viewer: { orgId: string; userId: string; role: Role }, agreementId: string) {
  const agreement = await prisma.agreement.findUnique({
    where: { id: agreementId },
    include: { project: { select: { id: true, confidential: true } } },
  });
  if (!agreement || agreement.orgId !== viewer.orgId) return null;
  const admin = viewer.role === "OWNER" || viewer.role === "ADMIN";
  // Unmatched ones are only in the admins' inbox.
  if (!agreement.clientId && !admin) return null;
  if (agreement.clientId && !admin) {
    const visible = await prisma.agreement.count({
      where: { id: agreement.id, ...agreementVisibilityWhere(viewer, { orgId: viewer.orgId, clientId: agreement.clientId }) },
    });
    if (!visible) return null;
  }
  return agreement;
}

export async function auditAgreementOpen(
  viewer: { orgId: string; userId: string },
  agreement: { id: string; title: string },
  action: "view" | "download"
) {
  await recordAuditEvent(prisma, {
    orgIds: [viewer.orgId],
    actorId: viewer.userId,
    action,
    entityType: "Agreement",
    entityId: agreement.id,
    entityLabel: agreement.title,
  });
}

/** What a client or project page's Signed agreements card needs; `show` is
 * false when there's nothing to show and no provider is connected. */
export async function agreementsCardData(
  viewer: { orgId: string; userId: string; role: Role },
  scope: { clientId: string; projectId?: string }
) {
  const canManage = viewer.role === "OWNER" || viewer.role === "ADMIN";
  const [agreements, connections] = await Promise.all([
    visibleAgreements(viewer, scope),
    canManage ? prisma.agreementConnection.count({ where: { orgId: viewer.orgId } }) : Promise.resolve(0),
  ]);
  return { agreements, canManage, show: agreements.length > 0 || connections > 0 };
}
