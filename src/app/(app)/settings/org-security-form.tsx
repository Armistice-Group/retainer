"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateOrgSecurityAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

type OrgSecurity = {
  domain: string | null;
  autoJoinDomain: boolean;
};

export function OrgSecurityForm({ org, readOnly }: { org: OrgSecurity; readOnly: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrgSecurityAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:max-w-sm">
        <Label htmlFor="domain">Organization domain</Label>
        <Input
          id="domain"
          name="domain"
          placeholder="acme.com"
          defaultValue={org.domain ?? ""}
          disabled={readOnly}
        />
        {state?.fieldErrors?.domain ? (
          <p className="text-sm text-destructive">{state.fieldErrors.domain[0]}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Must match your own email domain. Used for auto-join and SSO below.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="autoJoinDomain"
          name="autoJoinDomain"
          defaultChecked={org.autoJoinDomain}
          disabled={readOnly}
        />
        <Label htmlFor="autoJoinDomain" className="font-normal">
          Auto-join teammates with a matching email domain
        </Label>
      </div>

      {!readOnly ? (
        <div>
          <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
