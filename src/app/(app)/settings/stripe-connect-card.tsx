import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  startStripeConnectOnboardingAction,
  openStripeConnectDashboardAction,
} from "@/actions/stripe-connect";

export function StripeConnectCard({
  accountId,
  chargesEnabled,
  readOnly,
  connectStatus,
}: {
  accountId: string | null;
  chargesEnabled: boolean;
  readOnly: boolean;
  connectStatus?: string;
}) {
  return (
    <Card>
      <IntegrationCardHeader
        title="Collect payments (Stripe Connect)"
        logos={["stripe"]}
        status={{
          connected: chargesEnabled,
          notConnectedLabel: accountId ? "Setup unfinished" : "Not connected",
        }}
      />
      <CardContent className="flex flex-col gap-4">
        {connectStatus === "return" && !chargesEnabled ? (
          <Alert>
            <AlertDescription>
              Almost there — Stripe still needs a bit more info before payments can go through.
              Pick up where you left off below.
            </AlertDescription>
          </Alert>
        ) : null}

        <p className="text-sm text-muted-foreground">
          {chargesEnabled
            ? "Clients can pay invoices directly by card or ACH — money goes straight to your connected Stripe account."
            : accountId
              ? "Setup was started but isn't finished — Stripe needs a few more details before this account can accept payments."
              : "Connect a Stripe account so clients can pay invoices directly instead of you chasing a wire or check."}
        </p>

        {readOnly ? null : chargesEnabled ? (
          <form action={openStripeConnectDashboardAction}>
            <Button type="submit" variant="outline">
              Open Stripe dashboard
            </Button>
          </form>
        ) : (
          <form action={startStripeConnectOnboardingAction}>
            <SubmitButton pendingText="Redirecting...">
              <CreditCard className="size-3.5" />
              {accountId ? "Continue setup" : "Connect Stripe"}
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
