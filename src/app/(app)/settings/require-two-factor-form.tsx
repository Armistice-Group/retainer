"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateRequireTwoFactorAction } from "@/actions/two-factor-policy";
import type { ActionState } from "@/actions/auth";

export function RequireTwoFactorForm({
  enabled,
  canEdit,
  ownTwoFactor,
  missingCount,
}: {
  enabled: boolean;
  /** Owners only. */
  canEdit: boolean;
  /** Whether the viewer has their own authenticator app set up. */
  ownTwoFactor: boolean;
  /** Members who'd be (or are) stopped at the setup page. */
  missingCount: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateRequireTwoFactorAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex items-start gap-2">
        <Checkbox
          id="requireTwoFactor"
          name="requireTwoFactor"
          defaultChecked={enabled}
          disabled={!canEdit}
          className="mt-0.5"
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor="requireTwoFactor" className="font-normal">
            Require two-factor authentication
          </Label>
          <p className="text-xs text-muted-foreground">
            Everyone must add an authenticator app. Anyone who hasn&apos;t can still log in, but
            only to set it up — the rest of the app stays closed until they do. People who sign in
            with single sign-on are exempt; your identity provider handles their second factor. API
            keys keep working.
          </p>
        </div>
      </div>
      {missingCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          {missingCount === 1
            ? "1 person hasn't set up two-factor authentication yet"
            : `${missingCount} people haven't set up two-factor authentication yet`}
          {" — they're marked "}
          <span className="font-medium">No 2FA</span> on{" "}
          <Link href="/settings/members" className="underline underline-offset-2">
            Members
          </Link>
          .
        </p>
      ) : null}
      {canEdit && !enabled && !ownTwoFactor ? (
        <p className="text-xs text-muted-foreground">
          Set up two-factor authentication on your{" "}
          <Link href="/profile" className="underline underline-offset-2">
            Profile
          </Link>{" "}
          before turning this on.
        </p>
      ) : null}
      {!canEdit ? (
        <p className="text-xs text-muted-foreground">Only owners can change this.</p>
      ) : (
        <div>
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </div>
      )}
    </form>
  );
}
