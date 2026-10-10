"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { generateTotpSecret, totpUri, verifyTotp, generateRecoveryCodes } from "@/lib/two-factor";
import type { ActionState } from "@/actions/auth";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("You must be logged in.");
  return session.user.id;
}

export async function startTwoFactorSetupAction() {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: encrypt(secret), twoFactorEnabled: false },
  });

  return { secret, uri: totpUri(secret, user.email, "Consultainer") };
}

export type TwoFactorConfirmState =
  | ({ error?: string; fieldErrors?: Record<string, string[]>; recoveryCodes?: string[] } | null);

export async function confirmTwoFactorSetupAction(
  _prevState: TwoFactorConfirmState,
  formData: FormData
): Promise<TwoFactorConfirmState> {
  const userId = await requireUserId();
  const code = ((formData.get("code") as string) || "").trim();

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) {
    return { error: "Start setup again." };
  }

  const secret = decrypt(user.twoFactorSecret);
  if (!verifyTotp(secret, code)) {
    return { fieldErrors: { code: ["Invalid code. Try again."] } };
  }

  const recoveryCodes = generateRecoveryCodes();
  const hashed = await Promise.all(recoveryCodes.map((c) => bcrypt.hash(c, 10)));

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorRecoveryCodes: hashed },
  });

  // Not from the required-2FA setup page: re-rendering it now would send
  // the person on to the app before they've seen their recovery codes.
  if (formData.get("from") !== "required-setup") revalidatePath("/profile");
  return { recoveryCodes };
}

export async function cancelTwoFactorSetupAction() {
  const userId = await requireUserId();
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorSecret: null, twoFactorEnabled: false, twoFactorRecoveryCodes: [] },
  });
  revalidatePath("/profile");
}

export async function disableTwoFactorAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const userId = await requireUserId();
  const password = (formData.get("password") as string) || "";

  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash) {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { fieldErrors: { password: ["Incorrect password."] } };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] },
  });

  revalidatePath("/profile");
  return null;
}
