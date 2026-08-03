import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uniqueOrgSlug } from "@/lib/org";
import { notify, getOrgAdminUserIds } from "@/lib/notifications";
import { issueMagicLinkToken } from "@/lib/magic-link";
import { getOrigin } from "@/lib/url";

// A Route Handler, not a page — this does account/org-creating DB writes
// and redirects into the sign-in flow; keeping mutations out of a plain
// Server Component matches the OAuth callback routes elsewhere in this app
// (github/linear/quickbooks/sso all use route.ts for exactly this reason).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const origin = await getOrigin();
  const signupError = (reason: string) =>
    NextResponse.redirect(`${origin}/signup?error=${reason}`);

  const pending = await prisma.pendingSignup.findUnique({ where: { token } });
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await prisma.pendingSignup.delete({ where: { id: pending.id } });
    return signupError("verification-expired");
  }

  // Someone else may have taken this email (e.g. via Google) while this
  // confirmation was pending.
  const existingUser = await prisma.user.findUnique({ where: { email: pending.email } });
  if (existingUser) {
    await prisma.pendingSignup.delete({ where: { id: pending.id } });
    return NextResponse.redirect(`${origin}/login?error=account-exists`);
  }

  // Re-check for an auto-joinable org now, rather than trusting whatever was
  // true at signup-request time: two people on the same domain can request
  // signup before either confirms, so the first one to confirm creates the
  // org — the second must join THAT org as a MEMBER, not create a sibling
  // one, even though no org existed yet when they originally signed up.
  let targetOrg = pending.autoJoinOrgId
    ? await prisma.organization.findUnique({ where: { id: pending.autoJoinOrgId } })
    : null;
  if (!targetOrg && pending.claimableDomain) {
    targetOrg = await prisma.organization.findUnique({
      where: { domain: pending.claimableDomain },
    });
  }
  if (targetOrg && !targetOrg.autoJoinDomain) targetOrg = null;

  if (targetOrg) {
    const org = targetOrg;
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name: pending.name, email: pending.email, passwordHash: pending.passwordHash },
      });
      await tx.membership.create({
        data: { userId: created.id, orgId: org.id, role: "MEMBER" },
      });
      return created;
    });

    const adminIds = await getOrgAdminUserIds(prisma, org.id);
    await notify(prisma, {
      orgId: org.id,
      userIds: adminIds,
      type: "MEMBER_JOINED",
      message: `${user.name} joined your organization (matched ${org.domain} domain).`,
      link: "/settings/members",
    });
  } else if (pending.autoJoinOrgId) {
    // Had a specific org to join at signup time, but it's gone or no longer
    // auto-joining, and no domain fallback applies (invite-less auto-join
    // only, never "just make me a new org instead").
    await prisma.pendingSignup.delete({ where: { id: pending.id } });
    return signupError("verification-expired");
  } else {
    const slug = await uniqueOrgSlug(pending.orgName);
    const createOrg = (domain: string | null) =>
      prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: { name: pending.orgName, slug, domain },
        });
        const created = await tx.user.create({
          data: { name: pending.name, email: pending.email, passwordHash: pending.passwordHash },
        });
        await tx.membership.create({
          data: { userId: created.id, orgId: org.id, role: "OWNER" },
        });
        return created;
      });

    try {
      await createOrg(pending.claimableDomain);
    } catch (err) {
      // Genuinely concurrent confirmation raced us for the same domain —
      // fall back to an unclaimed org rather than failing signup outright.
      if (pending.claimableDomain && (err as { code?: string }).code === "P2002") {
        await createOrg(null);
      } else {
        throw err;
      }
    }
  }

  await prisma.pendingSignup.delete({ where: { id: pending.id } });

  const magicToken = await issueMagicLinkToken(pending.email);
  return NextResponse.redirect(`${origin}/login/magic/${magicToken}`);
}
