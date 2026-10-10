import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { ShareExpiryField } from "@/components/share/share-expiry-field";
import { shareExpiryLabel } from "@/components/share/share-expiry-label";
import {
  generateClientShareLinkAction,
  revokeClientShareLinkAction,
  setClientShareVerificationAction,
  signOutAllShareSessionsAction,
  signOutShareSessionAction,
} from "@/actions/client-share";
import type { ShareVerificationMode } from "@/generated/prisma/client";

const selectClass = "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm";

export type ShareVisitor = {
  id: string;
  contactName: string;
  email: string;
  lastSeenAt: Date;
};

function lastSeen(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function ClientShareLinkCard({
  clientId,
  shareUrl,
  expiresAt,
  now,
  verification,
  visitors,
}: {
  clientId: string;
  shareUrl: string | null;
  expiresAt: Date | null;
  now: Date;
  verification: {
    mode: ShareVerificationMode;
    orgDefault: boolean;
    /** Effective setting for this client. */
    required: boolean;
    emailConfigured: boolean;
  };
  /** Verified visitors with a live session, most recent first. */
  visitors: ShareVisitor[];
}) {
  // Only offered with email set up, unless it's already set (so it can be
  // switched back).
  const showVerification = verification.emailConfigured || verification.mode !== "INHERIT" || verification.required;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client link (all projects)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shareUrl ? (
          <>
            <p className="truncate text-sm text-muted-foreground">{shareUrl}</p>
            <p className="text-xs text-muted-foreground">{shareExpiryLabel(expiresAt, now)}</p>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={shareUrl} />
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
            <form
              action={generateClientShareLinkAction.bind(null, clientId)}
              className="flex flex-wrap items-end gap-2"
            >
              <ShareExpiryField id="client-share-regenerate" />
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage="Regenerate this link? The old link stops working immediately and everyone who verified their email has to do it again."
              >
                Regenerate
              </ConfirmSubmitButton>
            </form>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Generate one read-only link covering every non-confidential project for this
              client — hours, invoices, and billing totals across all of them. No login
              required, no internal rates shown.
            </p>
            <form
              action={generateClientShareLinkAction.bind(null, clientId)}
              className="flex flex-wrap items-end gap-2"
            >
              <ShareExpiryField id="client-share-generate" />
              <Button size="sm" type="submit">
                Generate client link
              </Button>
            </form>
          </>
        )}

        {showVerification ? (
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <form
              action={setClientShareVerificationAction.bind(null, clientId)}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor="shareVerification" className="text-sm font-medium">
                Require email verification
              </label>
              <p className="text-xs text-muted-foreground">
                Visitors to this client&apos;s links (client and project) enter their email and a
                code we send them. Only this client&apos;s contacts with an email can get in.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="shareVerification"
                  name="shareVerification"
                  defaultValue={verification.mode}
                  className={selectClass}
                >
                  <option value="INHERIT">
                    Organization default ({verification.orgDefault ? "on" : "off"})
                  </option>
                  <option value="ON">On</option>
                  <option value="OFF">Off</option>
                </select>
                <Button type="submit" size="sm" variant="outline">
                  Save
                </Button>
              </div>
              {verification.required && !verification.emailConfigured ? (
                <p className="text-xs text-destructive">
                  Email isn&apos;t set up, so nobody new can verify: the pages are closed to
                  anyone who hasn&apos;t already. Set up email in Settings → Integrations, or turn
                  this off.
                </p>
              ) : null}
            </form>

            {verification.required ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Verified visitors</p>
                {visitors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nobody has verified yet.</p>
                ) : (
                  <>
                    <ul className="flex flex-col divide-y divide-border">
                      {visitors.map((v) => (
                        <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                          <div className="min-w-0 text-sm">
                            <p className="truncate font-medium">{v.contactName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {v.email} · last seen {lastSeen(v.lastSeenAt)}
                            </p>
                          </div>
                          <form action={signOutShareSessionAction.bind(null, clientId, v.id)}>
                            <Button type="submit" size="sm" variant="ghost">
                              Sign out
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={signOutAllShareSessionsAction.bind(null, clientId)}>
                      <ConfirmSubmitButton
                        variant="outline"
                        size="sm"
                        confirmMessage="Sign out everyone? They'll need a new code to open the links."
                      >
                        Sign out everyone
                      </ConfirmSubmitButton>
                    </form>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
