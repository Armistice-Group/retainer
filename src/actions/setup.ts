"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent, withoutRowAudit } from "@/lib/audit";
import { uniqueOrgSlug } from "@/lib/org";
import { setupSchema } from "@/lib/validations/auth";
import { checkSetupToken, isSetupComplete, markSetupComplete } from "@/lib/setup";
import { normalizeOrigin, setPublicUrl } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

// Arbitrary constant key for pg_advisory_xact_lock — serializes concurrent
// setup submissions so two racing requests can't both create an admin.
const SETUP_LOCK_KEY = 4_620_117;

class SetupAlreadyCompleteError extends Error {}

export async function completeSetupAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  if (await isSetupComplete()) redirect("/login");

  if (!checkSetupToken(((formData.get("setupToken") as string) || "").trim())) {
    return { fieldErrors: { setupToken: ["Setup token doesn't match SETUP_TOKEN."] } };
  }

  const parsed = setupSchema.safeParse({
    orgName: formData.get("orgName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const rawPublicUrl = ((formData.get("publicUrl") as string) || "").trim();
  const publicUrl = rawPublicUrl ? normalizeOrigin(rawPublicUrl) : null;
  if (rawPublicUrl && !publicUrl) {
    return { fieldErrors: { publicUrl: ["Enter a full URL, like https://time.example.com"] } };
  }

  const { orgName, name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueOrgSlug(orgName);

  let created: { orgId: string; userId: string; membershipId: string };
  try {
    // The audit log can't point at the organization until it's committed,
    // so the rows go in unaudited and are logged just after.
    created = await withoutRowAudit(() =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
        if (await tx.user.findFirst({ select: { id: true } })) {
          throw new SetupAlreadyCompleteError();
        }
        const org = await tx.organization.create({ data: { name: orgName, slug } });
        const user = await tx.user.create({ data: { name, email, passwordHash } });
        const membership = await tx.membership.create({
          data: { userId: user.id, orgId: org.id, role: "OWNER" },
        });
        return { orgId: org.id, userId: user.id, membershipId: membership.id };
      })
    );
  } catch (err) {
    if (err instanceof SetupAlreadyCompleteError) {
      markSetupComplete();
      redirect("/login");
    }
    throw err;
  }

  for (const [entityType, entityId, entityLabel] of [
    ["Organization", created.orgId, orgName],
    ["Membership", created.membershipId, `${name} (owner)`],
  ] as const) {
    await recordAuditEvent(prisma, {
      orgIds: [created.orgId],
      actorId: created.userId,
      action: "create",
      entityType,
      entityId,
      entityLabel,
    });
  }

  markSetupComplete();
  if (publicUrl) await setPublicUrl(publicUrl);

  try {
    await signIn("credentials", { email, password, redirectTo: "/welcome" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Your account was created, but sign-in failed. Log in to continue." };
    }
    throw err;
  }

  return null;
}
