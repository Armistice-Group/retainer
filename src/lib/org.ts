import { prisma } from "@/lib/prisma";
import { slugify, randomSuffix } from "@/lib/slug";
import { isPublicEmailDomain } from "@/lib/free-email-domains";

export async function uniqueOrgSlug(name: string) {
  const base = slugify(name) || "org";
  let slug = base;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${base}-${randomSuffix()}`;
  }
  return slug;
}

export function emailDomain(email: string) {
  return email.toLowerCase().trim().split("@")[1] || null;
}

/** A domain is eligible for org-level claiming/auto-join only if it isn't a free provider. */
export function isClaimableDomain(domain: string) {
  return !isPublicEmailDomain(domain);
}

/**
 * Finds an existing org that a new signup with this email should auto-join,
 * based on a verified domain match — never for free email providers.
 */
export async function findAutoJoinOrg(email: string) {
  const domain = emailDomain(email);
  if (!domain || !isClaimableDomain(domain)) return null;

  return prisma.organization.findFirst({
    where: { domain, autoJoinDomain: true },
  });
}

export async function bootstrapOrgForUser(userId: string, orgName: string, email?: string) {
  const slug = await uniqueOrgSlug(orgName);
  const domain = email ? emailDomain(email) : null;
  const claimableDomain = domain && isClaimableDomain(domain) ? domain : null;

  const create = (domainValue: string | null) =>
    prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName, slug, domain: domainValue },
      });
      await tx.membership.create({ data: { userId, orgId: org.id, role: "OWNER" } });
      return org;
    });

  try {
    return await create(claimableDomain);
  } catch (err) {
    // Rare race: another signup claimed this domain between findAutoJoinOrg and
    // here. Fall back to an unclaimed org rather than failing signup outright.
    if (claimableDomain && (err as { code?: string }).code === "P2002") {
      return create(null);
    }
    throw err;
  }
}
