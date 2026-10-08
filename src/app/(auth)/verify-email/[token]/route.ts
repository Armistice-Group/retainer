import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/url";

// A Route Handler, not a page — signOut() needs to clear the session cookie,
// and cookies() can only be written from a Server Action or Route Handler.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = await getRequestOrigin();

  const pending = await prisma.pendingEmailChange.findUnique({ where: { token } });
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await prisma.pendingEmailChange.delete({ where: { id: pending.id } });
    return NextResponse.redirect(`${origin}/login?error=email-verification-expired`);
  }

  const taken = await prisma.user.findUnique({ where: { email: pending.newEmail } });
  if (taken) {
    await prisma.pendingEmailChange.delete({ where: { id: pending.id } });
    return NextResponse.redirect(`${origin}/login?error=email-already-taken`);
  }

  await prisma.user.update({ where: { id: pending.userId }, data: { email: pending.newEmail } });
  await prisma.pendingEmailChange.delete({ where: { id: pending.id } });

  // The session JWT (if any) caches the old email — sign out so it's never
  // used stale, and require a fresh login with the new address.
  await signOut({ redirectTo: "/login" });
  return NextResponse.redirect(`${origin}/login`);
}
