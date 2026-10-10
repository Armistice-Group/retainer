"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateShareVerificationDefaultAction } from "@/actions/client-share";
import type { ActionState } from "@/actions/auth";

/** Settings → Security: the org default for email verification on client
 * share links. Owners and admins. */
export function ShareVerificationForm({
  enabled,
  canEdit,
  emailConfigured,
}: {
  enabled: boolean;
  canEdit: boolean;
  emailConfigured: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateShareVerificationDefaultAction,
    null
  );
  // Can always be turned off; turning on needs email.
  const disabled = !canEdit || (!enabled && !emailConfigured);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-start gap-2">
        <Checkbox
          id="requireShareVerification"
          name="requireShareVerification"
          defaultChecked={enabled}
          disabled={disabled}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="requireShareVerification" className="font-normal">
            Require email verification on client links
          </Label>
          <p className="text-xs text-muted-foreground">
            Before a client or project link shows anything, the visitor enters their email and a
            6-digit code we send them. Only the client&apos;s contacts (with an email on file) get
            a code. They stay verified for 30 days in that browser. Each client can override this
            on its page. Invoice and estimate links stay open, so clients can always pay and
            respond.
          </p>
        </div>
      </div>
      {!emailConfigured && enabled ? (
        <p className="text-xs text-destructive">
          Email isn&apos;t set up, so nobody new can verify: the links are closed to anyone who
          hasn&apos;t already. Set up email in{" "}
          <Link href="/settings/integrations" className="underline underline-offset-2">
            Settings → Integrations
          </Link>
          , or turn this off.
        </p>
      ) : null}
      {!emailConfigured && !enabled ? (
        <p className="text-xs text-muted-foreground">
          Verification sends codes by email. Set up email in{" "}
          <Link href="/settings/integrations" className="underline underline-offset-2">
            Settings → Integrations
          </Link>{" "}
          to turn this on.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-xs text-muted-foreground">Only owners and admins can change this.</p>
      ) : (
        <div>
          <SubmitButton pendingText="Saving..." disabled={disabled}>
            Save
          </SubmitButton>
        </div>
      )}
    </form>
  );
}
