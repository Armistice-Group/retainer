"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";
import { auth, signIn } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signOutOtherSessions } from "@/lib/sessions";
import {
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
  issueLoginTicket,
} from "@/lib/webauthn";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("You must be logged in.");
  return session.user.id;
}

export async function startPasskeyRegistrationAction() {
  const userId = await requireUserId();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return buildRegistrationOptions(userId, user.email, user.name);
}

export async function finishPasskeyRegistrationAction(
  challengeId: string,
  response: RegistrationResponseJSON,
  deviceName: string
): Promise<{ error: string | null }> {
  const userId = await requireUserId();

  try {
    const authenticator = await verifyRegistration(challengeId, userId, response);
    if (deviceName.trim()) {
      await prisma.authenticator.update({
        where: { id: authenticator.id },
        data: { deviceName: deviceName.trim() },
      });
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Couldn't add this passkey." };
  }

  revalidatePath("/profile");
  return { error: null };
}

export async function deletePasskeyAction(id: string) {
  const userId = await requireUserId();
  const { count } = await prisma.authenticator.deleteMany({ where: { id, userId } });
  if (count === 0) {
    revalidatePath("/profile");
    return;
  }
  // A removed passkey is often a lost or old device: sign out everything
  // else too, keeping this session (lib/sessions).
  await signOutOtherSessions(userId);
  redirect("/profile?security=passkey-removed");
}

export async function startPasskeyLoginAction() {
  return buildAuthenticationOptions();
}

export async function finishPasskeyLoginAction(
  challengeId: string,
  response: AuthenticationResponseJSON,
  callbackUrl: string
): Promise<{ error: string | null }> {
  try {
    const authenticator = await verifyAuthentication(challengeId, response);
    const ticket = await issueLoginTicket(authenticator.userId);
    await signIn("passkey", { ticket, redirectTo: callbackUrl });
  } catch (err) {
    // signIn() on success throws a Next.js redirect internally — only treat
    // genuine failures as errors, let a redirect propagate.
    const digest = err && typeof err === "object" && "digest" in err ? err.digest : undefined;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't sign in with that passkey." };
  }
  return { error: null };
}
