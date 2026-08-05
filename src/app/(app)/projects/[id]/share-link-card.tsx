import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { generateShareLinkAction, revokeShareLinkAction } from "@/actions/project-share";

export function ShareLinkCard({
  projectId,
  shareUrl,
}: {
  projectId: string;
  shareUrl: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client link</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shareUrl ? (
          <>
            <p className="truncate text-sm text-muted-foreground">{shareUrl}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={shareUrl} />
              <form action={generateShareLinkAction.bind(null, projectId)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage="Regenerate this link? The old link will stop working immediately."
                >
                  Regenerate
                </ConfirmSubmitButton>
              </form>
              <form action={revokeShareLinkAction.bind(null, projectId)}>
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
              Generate a read-only link for this client to view progress, budget burn, and
              billing totals — no login required, no internal rates shown.
            </p>
            <form action={generateShareLinkAction.bind(null, projectId)}>
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
