"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueOrgSlug } from "@/lib/org";
import { setupSchema } from "@/lib/validations/auth";
import { checkSetupToken, isSetupComplete, markSetupComplete } from "@/lib/setup";
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

  const { orgName, name, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueOrgSlug(orgName);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK_KEY})`;
      if (await tx.user.findFirst({ select: { id: true } })) {
        throw new SetupAlreadyCompleteError();
      }
      const org = await tx.organization.create({ data: { name: orgName, slug } });
      const user = await tx.user.create({ data: { name, email, passwordHash } });
      await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: "OWNER" } });
    });
  } catch (err) {
    if (err instanceof SetupAlreadyCompleteError) {
      markSetupComplete();
      redirect("/login");
    }
    throw err;
  }

  markSetupComplete();

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
