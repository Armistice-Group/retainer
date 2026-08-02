import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { disconnectGithubAction } from "@/actions/integrations";

export function GithubCard({
  connected,
  login,
  readOnly,
  callbackStatus,
}: {
  connected: boolean;
  login: string | null;
  readOnly: boolean;
  callbackStatus?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Code Health</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {callbackStatus === "error" ? (
          <Alert variant="destructive">
            <AlertDescription>
              Couldn&apos;t connect to GitHub. Double-check your GitHub OAuth app credentials and try
              again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div>
            <p className="text-sm font-medium">GitHub</p>
            {connected ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-3.5 text-chart-3" />
                Connected {login ? `· @${login}` : ""}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Connect GitHub so projects can pick a repo to scan for AI Code Health.
              </p>
            )}
          </div>
          {readOnly ? null : connected ? (
            <form action={disconnectGithubAction}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage="Disconnect GitHub? Projects with a connected repo will need it reconnected before they can scan again."
              >
                Disconnect
              </ConfirmSubmitButton>
            </form>
          ) : (
            <Button size="sm" asChild>
              <Link href="/api/integrations/github/connect" prefetch={false}>Connect</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
