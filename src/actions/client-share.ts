"use server";

import { revalidatePath } from "next/cache";
import { DRAFT_CLIENT_ERROR, isDraftClient } from "@/lib/client-status";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { recordAuditEvent } from "@/lib/audit";
import { isEmailConfigured } from "@/lib/email";
import { generateShareToken } from "@/lib/services/project-share";
import {
  endClientShareSessions,
  endSessionsWhereVerificationOff,
  parseShareExpiry,
  verificationRequired,
} from "@/lib/share-gate";
import type { ShareVerificationMode } from "@/generated/prisma/client";
import type { ActionState } from "@/actions/auth";

async function manageableClient(clientId: string) {
  const { org, role, user } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.orgId !== org.id) throw new Error("Client not found.");
  if (isDraftClient(client)) throw new Error(DRAFT_CLIENT_ERROR);
  return { org, user, client };
}

/** Generate or regenerate the client link, with an optional expiry
 * ("Expires" on the card). Regenerating signs out everyone who verified on
 * the old link. */
export async function generateClientShareLinkAction(clientId: string, formData?: FormData) {
  const { client } = await manageableClient(clientId);
  const shareExpiresAt = parseShareExpiry(formData);

  await prisma.client.update({
    where: { id: client.id },
    data: { shareToken: generateShareToken(), shareExpiresAt },
  });
  await endClientShareSessions([client.id]);
  revalidatePath(`/clients/${clientId}`);
}

export async function revokeClientShareLinkAction(clientId: string) {
  const { client } = await manageableClient(clientId);

  await prisma.client.update({
    where: { id: client.id },
    data: { shareToken: null, shareExpiresAt: null },
  });
  await endClientShareSessions([client.id]);
  revalidatePath(`/clients/${clientId}`);
}

const MODES: ShareVerificationMode[] = ["INHERIT", "ON", "OFF"];

/** "Require email verification" for this client's share pages: follow the
 * organization default, or always on / off. Turning it on needs email set
 * up; when it ends up off, verified sessions are dropped so turning it on
 * again asks everyone afresh. */
export async function setClientShareVerificationAction(clientId: string, formData: FormData) {
  const { org, client } = await manageableClient(clientId);
  const mode = String(formData.get("shareVerification") ?? "");
  if (!MODES.includes(mode as ShareVerificationMode)) throw new Error("Choose a verification setting.");
  const next = mode as ShareVerificationMode;

  const required = verificationRequired(org.requireShareVerification, next);
  if (required && !verificationRequired(org.requireShareVerification, client.shareVerification)) {
    if (!(await isEmailConfigured())) {
      throw new Error("Set up email first (Settings → Integrations): verification sends a code by email.");
    }
  }

  await prisma.client.update({ where: { id: client.id }, data: { shareVerification: next } });
  if (!required) await endClientShareSessions([client.id]);
  revalidatePath(`/clients/${clientId}`);
}

/** "Sign out" next to one verified visitor. */
export async function signOutShareSessionAction(clientId: string, sessionId: string) {
  const { org, user, client } = await manageableClient(clientId);
  const session = await prisma.shareSession.findUnique({
    where: { id: sessionId },
    include: { contact: { select: { name: true } } },
  });
  if (!session || session.clientId !== client.id) throw new Error("Session not found.");

  await prisma.shareSession.delete({ where: { id: session.id } });
  await recordAuditEvent(prisma, {
    orgIds: [org.id],
    actorId: user.id,
    action: "share_sign_out",
    entityType: "Client",
    entityId: client.id,
    entityLabel: `${session.contact.name} (${session.email}) on ${client.name}`,
  });
  revalidatePath(`/clients/${clientId}`);
}

/** "Sign out everyone" on the client's share link. */
export async function signOutAllShareSessionsAction(clientId: string) {
  const { org, user, client } = await manageableClient(clientId);
  const count = await endClientShareSessions([client.id]);
  if (count > 0) {
    await recordAuditEvent(prisma, {
      orgIds: [org.id],
      actorId: user.id,
      action: "share_sign_out",
      entityType: "Client",
      entityId: client.id,
      entityLabel: `Everyone (${count}) on ${client.name}`,
    });
  }
  revalidatePath(`/clients/${clientId}`);
}

/** Settings → Security (owners and admins): the organization default for
 * "Require email verification" on client share pages. Turning it on needs
 * email set up. Clients set to follow the default lose their verified
 * sessions when it goes off. */
export async function updateShareVerificationDefaultAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);

  const requireShareVerification = formData.get("requireShareVerification") === "on";
  if (requireShareVerification && !org.requireShareVerification && !(await isEmailConfigured())) {
    return {
      error: "Set up email first (Settings → Integrations): verification sends a code by email.",
    };
  }

  await prisma.organization.update({ where: { id: org.id }, data: { requireShareVerification } });
  await endSessionsWhereVerificationOff(org.id, requireShareVerification);
  revalidatePath("/settings/security");
  return { saved: true };
}
