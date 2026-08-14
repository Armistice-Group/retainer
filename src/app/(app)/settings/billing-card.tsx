import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { startCheckoutAction, openBillingPortalAction } from "@/actions/billing";
import { FREE_CLIENT_LIMIT, FREE_MEMBER_LIMIT } from "@/lib/plan-limits";
import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_DISCOUNT_PERCENT,
  GROWTH_MONTHLY_PRICE_USD,
  GROWTH_YEARLY_PRICE_USD,
  GROWTH_YEARLY_DISCOUNT_PERCENT,
} from "@/lib/pricing";
import type { Plan } from "@/generated/prisma/client";

const PLAN_LABEL: Record<Plan, string> = {
  FREE: "Free",
  PAID: "Consultainer",
  GROWTH: "Growth",
};

export function BillingCard({
  plan,
  subscriptionStatus,
  clientCount,
  memberCount,
  readOnly,
  stripeConfigured,
  growthTierConfigured,
  checkoutStatus,
}: {
  plan: Plan;
  subscriptionStatus: string | null;
  clientCount: number;
  memberCount: number;
  readOnly: boolean;
  stripeConfigured: boolean;
  growthTierConfigured: boolean;
  checkoutStatus?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Billing</CardTitle>
        <Badge variant={plan === "FREE" ? "secondary" : "default"}>{PLAN_LABEL[plan]}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {checkoutStatus === "success" ? (
          <Alert>
            <AlertDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-chart-3" />
              Subscription active — thanks for upgrading.
            </AlertDescription>
          </Alert>
        ) : null}
        {checkoutStatus === "cancelled" ? (
          <Alert>
            <AlertDescription>Checkout cancelled — no changes made.</AlertDescription>
          </Alert>
        ) : null}

        {plan === "FREE" ? (
          <div className="text-sm text-muted-foreground">
            <p>
              {clientCount}/{FREE_CLIENT_LIMIT} clients · {memberCount}/{FREE_MEMBER_LIMIT} team
              member on the free plan.
            </p>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p>
              Unlimited clients and team members.
              {plan === "GROWTH" ? " Stripe Connect is available for this org." : ""}
            </p>
            {subscriptionStatus && subscriptionStatus !== "active" ? (
              <p className="mt-1 text-destructive">Subscription status: {subscriptionStatus}</p>
            ) : null}
          </div>
        )}

        {!stripeConfigured ? (
          <Alert>
            <AlertDescription>
              Billing isn&apos;t configured on this instance yet. Contact support to
              {plan === "FREE" ? " upgrade" : " manage your subscription"}.
            </AlertDescription>
          </Alert>
        ) : readOnly ? null : (
          <div className="flex flex-col gap-4">
            {plan === "FREE" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground uppercase">Consultainer</p>
                <div className="flex flex-wrap gap-2">
                  <form action={startCheckoutAction.bind(null, "paid", "monthly")}>
                    <SubmitButton pendingText="Redirecting...">
                      Upgrade — ${MONTHLY_PRICE_USD.toFixed(2)}/mo
                    </SubmitButton>
                  </form>
                  <form action={startCheckoutAction.bind(null, "paid", "yearly")}>
                    <SubmitButton variant="outline" pendingText="Redirecting...">
                      Yearly — ${YEARLY_PRICE_USD.toFixed(2)}/yr (save {YEARLY_DISCOUNT_PERCENT}%)
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}

            {plan !== "GROWTH" && growthTierConfigured ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  Growth — adds Stripe Connect
                </p>
                <p className="text-xs text-muted-foreground">
                  Everything above, plus collecting invoice payments directly (ACH, card) instead
                  of just sending invoices out.
                </p>
                <div className="flex flex-wrap gap-2">
                  <form action={startCheckoutAction.bind(null, "growth", "monthly")}>
                    <SubmitButton pendingText="Redirecting...">
                      Upgrade — ${GROWTH_MONTHLY_PRICE_USD.toFixed(2)}/mo
                    </SubmitButton>
                  </form>
                  <form action={startCheckoutAction.bind(null, "growth", "yearly")}>
                    <SubmitButton variant="outline" pendingText="Redirecting...">
                      Yearly — ${GROWTH_YEARLY_PRICE_USD.toFixed(2)}/yr (save{" "}
                      {GROWTH_YEARLY_DISCOUNT_PERCENT}%)
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ) : null}

            {plan !== "FREE" ? (
              <form action={openBillingPortalAction}>
                <Button type="submit" variant="outline">
                  Manage billing
                </Button>
              </form>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
