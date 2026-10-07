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
