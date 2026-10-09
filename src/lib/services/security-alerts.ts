import "server-only";
import { prisma } from "@/lib/prisma";
import { sendAlert } from "@/lib/alerts";

type Row = Record<string, unknown>;
type Change = { from?: unknown; to?: unknown };

const BULK_DELETE_THRESHOLD = 20;
const BULK_WINDOW_MS = 10 * 60 * 1000;

async function nameOf(userId: unknown) {
  if (typeof userId !== "string") return "someone";
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name ?? "someone";
}

const roleLabel = (r: unknown) =>
  r === "OWNER" ? "owner" : r === "ADMIN" ? "admin" : r === "MEMBER" ? "member" : String(r);

/** Called from the audit hook for every recorded write: raises a security
 * alert for access-related changes, and when one person deletes a lot in a
 * short time. Never throws. */
export async function alertOnSecurityEvent(entry: {
  orgId: string;
  actorId: string | null;
  model: string;
  action: string;
  row: Row | null;
  changes: Record<string, unknown> | null;
  count: number | null;
}) {
  try {
    const message = await describe(entry);
    if (message) {
      const actor = entry.actorId ? await nameOf(entry.actorId) : "Consultainer";
      await sendAlert({
        orgId: entry.orgId,
        event: "SECURITY_ALERT",
        notificationType: "SECURITY_ALERT",
        message: `${actor} ${message.text}.`,
        link: message.link,
        excludeUserId: entry.actorId,
      });
    }
    if (entry.action === "delete" && entry.actorId) await checkBulkDeletes(entry.orgId, entry.actorId);
  } catch (err) {
    console.warn("[security-alerts] Failed", entry.model, err);
  }
}

async function describe(entry: {
  model: string;
  action: string;
  row: Row | null;
  changes: Record<string, unknown> | null;
}): Promise<{ text: string; link: string } | null> {
  const { model, action, row } = entry;
  const changes = (entry.changes ?? {}) as Record<string, Change>;
  switch (model) {
    case "Membership":
      if (action === "update" && changes.role) {
        return {
          text: `changed ${await nameOf(row?.userId)}'s role from ${roleLabel(changes.role.from)} to ${roleLabel(changes.role.to)}`,
          link: "/settings/members",
        };
      }
      if (action === "delete") {
        return { text: `removed ${await nameOf(row?.userId)} from the organization`, link: "/settings/members" };
      }
      return null;
    case "Invite":
      return action === "create"
        ? { text: `invited ${row?.email} as ${roleLabel(row?.role)}`, link: "/settings/members" }
        : null;
    case "ApiKey":
      if (action === "create") {
        return { text: `created API key "${row?.name}" for ${await nameOf(row?.userId)}`, link: "/settings/audit?type=ApiKey" };
      }
      if ((action === "update" && changes.revokedAt?.to) || action === "delete") {
        return { text: `revoked API key "${row?.name}"`, link: "/settings/audit?type=ApiKey" };
      }
      return null;
    case "SsoConnection":
      if (action === "update" && Object.keys(changes).length === 0) return null;
      return {
        text:
          action === "create"
            ? "set up single sign-on"
            : action === "delete"
              ? "removed single sign-on"
              : `changed single sign-on settings (${Object.keys(changes).join(", ")})`,
        link: "/settings/security",
      };
    case "Organization": {
      const fields = ["domain", "autoJoinDomain"].filter((f) => f in changes);
      return fields.length
        ? { text: `changed sign-in settings (${fields.join(", ")})`, link: "/settings/security" }
        : null;
    }
    case "User":
      if (changes.twoFactorEnabled && changes.twoFactorEnabled.to === false) {
        return { text: `turned off two-factor authentication for ${row?.name ?? "their account"}`, link: "/settings/audit?type=User" };
      }
      if (changes.email) {
        return { text: `changed the sign-in email for ${row?.name}`, link: "/settings/audit?type=User" };
      }
      return null;
    case "Authenticator":
      return action === "delete"
        ? { text: `removed a passkey from ${await nameOf(row?.userId)}'s account`, link: "/settings/audit?type=Authenticator" }
        : null;
    default:
      return null;
  }
}

/** One alert when someone deletes BULK_DELETE_THRESHOLD+ records within
 * BULK_WINDOW_MS — then quiet for that person for the rest of the window. */
async function checkBulkDeletes(orgId: string, actorId: string) {
  const since = new Date(Date.now() - BULK_WINDOW_MS);
  const deletes = await prisma.auditLog.findMany({
    where: { orgId, actorId, action: "delete", createdAt: { gte: since } },
    select: { count: true },
  });
  const total = deletes.reduce((s, d) => s + (d.count ?? 1), 0);
  if (total < BULK_DELETE_THRESHOLD) return;
  const recent = await prisma.notification.findFirst({
    where: {
      orgId,
      type: "SECURITY_ALERT",
      message: { contains: "deleted" },
      link: `/settings/audit?actor=${actorId}&action=delete`,
      createdAt: { gte: since },
    },
  });
  if (recent) return;
  await sendAlert({
    orgId,
    event: "SECURITY_ALERT",
    notificationType: "SECURITY_ALERT",
    message: `${await nameOf(actorId)} deleted ${total} records in the last ${BULK_WINDOW_MS / 60000} minutes.`,
    link: `/settings/audit?actor=${actorId}&action=delete`,
  });
}
