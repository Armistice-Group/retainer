import "server-only";
import { prisma } from "@/lib/prisma";
import { displayPaymentMethod } from "@/lib/payment-methods";

/** The methods that apply to a client: its own if it has any, otherwise the
 * org's defaults. Pass no clientId for just the org defaults. */
export async function effectivePaymentMethods(orgId: string, clientId?: string | null) {
  const order = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];
  if (clientId) {
    const own = await prisma.paymentMethod.findMany({ where: { orgId, clientId }, orderBy: order });
    if (own.length) return own.map(displayPaymentMethod);
  }
  const defaults = await prisma.paymentMethod.findMany({
    where: { orgId, clientId: null },
    orderBy: order,
  });
  return defaults.map(displayPaymentMethod);
}
