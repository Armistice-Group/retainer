import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { generateClientShareLinkAction, revokeClientShareLinkAction } from "@/actions/client-share";

export function ClientShareLinkCard({
  clientId,
  shareUrl,
}: {
  clientId: string;
  shareUrl: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client link (all projects)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shareUrl ? (
          <>
            <p className="truncate text-sm text-muted-foreground">{shareUrl}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={shareUrl} />
              <form action={generateClientShareLinkAction.bind(null, clientId)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Regenerate this link? The old link will stop working immediately."
                >
                  Regenerate
                </ConfirmSubmitButton>
              </form>
              <form action={revokeClientShareLinkAction.bind(null, clientId)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Revoke this link? Anyone using it will lose access immediately."
                >
                  Revoke
                </ConfirmSubmitButton>
              </form>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Generate one read-only link covering every non-confidential project for this
              client — hours, invoices, and billing totals across all of them. No login
              required, no internal rates shown.
            </p>
            <form action={generateClientShareLinkAction.bind(null, clientId)}>
              <Button size="sm" type="submit">
                Generate client link
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
