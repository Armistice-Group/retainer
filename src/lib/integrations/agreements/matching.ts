// Suggests which client a signed agreement belongs to, from its signers'
// email addresses: an exact match on a client's contact (or client/billing)
// email counts most, then a shared company domain (a contact's, or the
// client's website). Free-mail domains (gmail.com, ...) and the org's own
// domains never count — your own signature is on every agreement. Pure.

import { isPublicEmailDomain } from "@/lib/free-email-domains";
import type { Signer } from "./parse";

export type MatchClient = {
  id: string;
  name: string;
  website: string | null;
  /** The client's email, billing email and every contact's email. */
  emails: string[];
};

export function emailDomain(email: string) {
  const at = email.lastIndexOf("@");
  return at > 0 ? email.slice(at + 1).trim().toLowerCase() : null;
}

export function websiteDomain(website: string | null) {
  if (!website) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const normalizeName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|gmbh|plc|sa|bv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** sub.acme.com and acme.com count as the same company. */
const sameDomain = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/** The best-matching client's id, or null when nothing matches or two
 * clients match equally well. */
export function suggestClient(
  signers: Signer[],
  clients: MatchClient[],
  opts: { ownDomains: string[]; counterparty?: string | null }
): string | null {
  const own = opts.ownDomains.map((d) => d.toLowerCase());
  const countable = (domain: string | null): domain is string =>
    !!domain && !isPublicEmailDomain(domain) && !own.some((o) => sameDomain(o, domain));

  const signerEmails = new Set(
    signers.map((s) => s.email?.toLowerCase()).filter((e): e is string => !!e)
  );
  const signerDomains = new Set([...signerEmails].map(emailDomain).filter(countable));
  const counterparty = opts.counterparty ? normalizeName(opts.counterparty) : null;

  let best: string | null = null;
  let bestScore = 0;
  let tie = false;
  for (const client of clients) {
    const emails = client.emails.map((e) => e.toLowerCase());
    const domains = new Set(
      [...emails.map(emailDomain), websiteDomain(client.website)].filter(countable)
    );
    let score = 0;
    for (const email of emails) {
      if (signerEmails.has(email) && countable(emailDomain(email))) score += 10;
    }
    for (const d of signerDomains) {
      if ([...domains].some((cd) => sameDomain(cd, d))) score += 3;
    }
    if (counterparty && normalizeName(client.name) === counterparty) score += 5;
    if (score > bestScore) {
      best = client.id;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) {
      tie = true;
    }
  }
  return tie ? null : best;
}
