import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { ShareExpiryField } from "@/components/share/share-expiry-field";
import { shareExpiryLabel } from "@/components/share/share-expiry-label";
import {
  generateShareLinkAction,
  revokeShareLinkAction,
  setShareTasksAction,
} from "@/actions/project-share";

export function ShareLinkCard({
  projectId,
  shareUrl,
  shareTasks,
  expiresAt,
  now,
  verificationRequired,
}: {
  projectId: string;
  shareUrl: string | null;
  shareTasks: boolean;
  expiresAt: Date | null;
  now: Date;
  /** The client requires email verification on its links. */
  verificationRequired: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <p className="text-sm font-medium">Client link</p>
      {shareUrl ? (
        <>
          <p className="truncate text-sm text-muted-foreground">{shareUrl}</p>
          <p className="text-xs text-muted-foreground">
            {shareExpiryLabel(expiresAt, now)}
            {verificationRequired ? " · Email verification on (set on the client page)" : ""}
          </p>
          <form action={setShareTasksAction.bind(null, projectId, !shareTasks)}>
            <label className="flex items-start gap-2 text-sm">
              <button
                type="submit"
                role="switch"
                aria-checked={shareTasks}
                className={`mt-0.5 inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-border transition-colors ${shareTasks ? "bg-primary" : "bg-muted"}`}
              >
                <span
                  className={`size-3 rounded-full bg-background shadow transition-transform ${shareTasks ? "translate-x-3" : "translate-x-0.5"}`}
                />
              </button>
              <span>
                Show tasks
                <span className="block text-xs text-muted-foreground">
                  Task titles and status, plus comments you mark “Share with client”.
                </span>
              </span>
            </label>
          </form>
          <div className="flex flex-wrap gap-2">
            <CopyButton value={shareUrl} />
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
          <form
            action={generateShareLinkAction.bind(null, projectId)}
            className="flex flex-wrap items-end gap-2"
          >
            <ShareExpiryField id="project-share-regenerate" />
            <ConfirmSubmitButton
              variant="outline"
              size="sm"
              confirmMessage="Regenerate this link? The old link will stop working immediately."
            >
              Regenerate
            </ConfirmSubmitButton>
          </form>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Generate a read-only link for this client to view progress, budget burn, and billing
            totals — no login required, no internal rates shown.
          </p>
          <form
            action={generateShareLinkAction.bind(null, projectId)}
            className="flex flex-wrap items-end gap-2"
          >
            <ShareExpiryField id="project-share-generate" />
            <Button size="sm" type="submit">
              Generate client link
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
