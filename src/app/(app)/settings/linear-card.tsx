import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectLinearAction } from "@/actions/integrations";

export function LinearCard({
  connected,
  workspaceName,
  readOnly,
  callbackStatus,
}: {
  connected: boolean;
  workspaceName: string | null;
  readOnly: boolean;
  callbackStatus?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Linear</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {callbackStatus === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t connect to Linear. Double-check your Linear OAuth app credentials and
              try again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">Linear</p>
            {connected ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-chart-3" />
                Connected {workspaceName ? `· ${workspaceName}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Connect Linear so projects can pull in issues as tasks.
              </p>
            )}
          </div>
          {readOnly ? null : connected ? (
            <form action={disconnectLinearAction}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage="Disconnect Linear? Projects linked to a Linear team will need it reconnected before they can sync again."
              >
                Disconnect
              </ConfirmSubmitButton>
            </form>
          ) : (
            <Button size="sm" asChild>
              <Link href="/api/integrations/linear/connect">Connect</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
