import "server-only";
import { prisma } from "@/lib/prisma";
import { displayPaymentMethod } from "@/lib/payment-methods";

const ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

/** The methods offered to a client: its own first, then the org's (unless
 * the client turned them off, or individual ones). Pass no clientId for
 * just the org's. */
export async function effectivePaymentMethods(orgId: string, clientId?: string | null) {
  const orgMethods = await prisma.paymentMethod.findMany({
    where: { orgId, clientId: null },
    orderBy: ORDER,
  });
  if (!clientId) return orgMethods.map(displayPaymentMethod);

  const [client, own] = await Promise.all([
    prisma.client.findUnique({
      where: { id: clientId },
      select: { useOrgPaymentMethods: true, excludedOrgPaymentMethodIds: true },
    }),
    prisma.paymentMethod.findMany({ where: { orgId, clientId }, orderBy: ORDER }),
  ]);
  const inherited =
    client?.useOrgPaymentMethods === false
      ? []
      : orgMethods.filter((m) => !client?.excludedOrgPaymentMethodIds.includes(m.id));
  return [...own, ...inherited].map(displayPaymentMethod);
}
