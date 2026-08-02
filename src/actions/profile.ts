"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  updateProfileSchema,
  changePasswordSchema,
  changeEmailSchema,
} from "@/lib/validations/profile";
import type { ActionState } from "@/actions/auth";

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

  revalidatePath("/settings/profile");
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

  await prisma.user.update({
    where: { id: user.id },
    data: { email: parsed.data.newEmail },
  });

  // The session JWT caches the old email, so sign out and require a fresh
  // login rather than leaving a stale email cached until the token expires.
  await signOut({ redirectTo: "/login" });
  redirect("/login");
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
