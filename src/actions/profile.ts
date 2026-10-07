"use server";

import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import {
  updateProfileSchema,
  changePasswordSchema,
  changeEmailSchema,
} from "@/lib/validations/profile";
import { contractorProfileSchema } from "@/lib/validations/contractor";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { ConfirmEmailChangeEmail } from "@/emails/confirm-email-change-email";
import { getOrigin } from "@/lib/url";
import type { ActionState } from "@/actions/auth";

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export async function updateContractorProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { user, org } = await requireOrgContext();

  const parsed = contractorProfileSchema.safeParse({
    title: formData.get("title"),
    bio: formData.get("bio"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const file = formData.get("resumeFile");
  let resumeFileName: string | undefined;
  let resumeFileData: Buffer<ArrayBuffer> | undefined;
  let resumeContentType: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (!ALLOWED_RESUME_TYPES.has(file.type)) {
      return { error: "Resume must be a PDF, PNG, or JPEG." };
    }
    if (file.size > MAX_RESUME_BYTES) {
      return { error: "Resume must be under 5MB." };
    }
    resumeFileName = file.name;
    resumeFileData = Buffer.from(await file.arrayBuffer());
    resumeContentType = file.type;
  }

  await prisma.membership.update({
    where: { userId_orgId: { userId: user.id, orgId: org.id } },
    data: {
      title: parsed.data.title || null,
      bio: parsed.data.bio || null,
      ...(resumeFileData
        ? { resumeFileName, resumeFileData, resumeContentType }
        : {}),
    },
  });

  revalidatePath("/profile");
  return null;
}

export async function updateProfileAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in." };

  const parsed = updateProfileSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/profile");
  return null;
}

export async function changeEmailAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in." };

  const parsed = changeEmailSchema.safeParse({
    newEmail: formData.get("newEmail"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });

  if (user.passwordHash) {
    const valid = await bcrypt.compare(parsed.data.password || "", user.passwordHash);
    if (!valid) {
      return { fieldErrors: { password: ["Incorrect password."] } };
    }
  }

  if (parsed.data.newEmail === user.email) {
    return { fieldErrors: { newEmail: ["That's already your email."] } };
  }

  const taken = await prisma.user.findUnique({ where: { email: parsed.data.newEmail } });
  if (taken) {
    return { fieldErrors: { newEmail: ["That email is already in use."] } };
  }

  if (!isEmailConfigured()) {
    // No way to send a confirmation link. A password re-check is the best
    // available proof it's really you; accounts without a local password
    // (SSO/Google) get their email from the identity provider instead.
    if (!user.passwordHash) {
      return { error: "Your email is managed by your sign-in provider." };
    }
    await prisma.user.update({ where: { id: user.id }, data: { email: parsed.data.newEmail } });
    // The session JWT caches the old email — require a fresh login.
    await signOut({ redirectTo: "/login" });
    return null;
  }

  // Don't apply the change yet — confirm the new address is actually yours
  // first, or a compromised session could pivot into someone else's real
  // email (and from there, claim their company's domain in org Security).
  const token = randomUUID();
  await prisma.pendingEmailChange.create({
    data: {
      token,
      userId: user.id,
      newEmail: parsed.data.newEmail,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const origin = await getOrigin();
  await sendEmail({
    to: parsed.data.newEmail,
    subject: "Confirm your new email for Consultainer",
    react: ConfirmEmailChangeEmail({ confirmUrl: `${origin}/verify-email/${token}`, origin }),
  });

  return { emailChangePending: true };
}

export async function changePasswordAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be logged in." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  if (user.passwordHash) {
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      return { fieldErrors: { currentPassword: ["Current password is incorrect."] } };
    }
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return null;
}
