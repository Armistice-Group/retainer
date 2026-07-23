import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectQuickBooksAction } from "@/actions/integrations";

export function QuickBooksCard({
  connected,
  realmId,
  readOnly,
  callbackStatus,
}: {
  connected: boolean;
  realmId: string | null;
  readOnly: boolean;
  callbackStatus?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integrations</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {callbackStatus === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t connect to QuickBooks. Double-check your QuickBooks app credentials and
              try again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">QuickBooks Online</p>
            {connected ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-chart-3" />
                Connected {realmId ? `· company ${realmId}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Push invoices to QuickBooks as they&apos;re created.
              </p>
            )}
          </div>
          {readOnly ? null : connected ? (
            <form action={disconnectQuickBooksAction}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage="Disconnect QuickBooks? Existing pushed invoices stay linked, but you won't be able to push new ones until you reconnect."
              >
                Disconnect
              </ConfirmSubmitButton>
            </form>
          ) : (
            <Button size="sm" asChild>
              <Link href="/api/integrations/quickbooks/connect">Connect</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
