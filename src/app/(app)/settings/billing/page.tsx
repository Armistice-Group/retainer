import { requireOrgContext } from "@/lib/org-context";
import { prisma } from "@/lib/prisma";
import { isStripeConfigured } from "@/lib/stripe";
import { BillingCard } from "../billing-card";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { org, role } = await requireOrgContext();
  const readOnly = role === "MEMBER";
  const { checkout } = await searchParams;

  const [clientCount, memberCount] = await Promise.all([
    prisma.client.count({ where: { orgId: org.id } }),
    prisma.membership.count({ where: { orgId: org.id } }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <BillingCard
        plan={org.plan}
        subscriptionStatus={org.stripeSubscriptionStatus}
        clientCount={clientCount}
        memberCount={memberCount}
        readOnly={readOnly}
        stripeConfigured={isStripeConfigured()}
        checkoutStatus={checkout}
      />
    </div>
  );
}
