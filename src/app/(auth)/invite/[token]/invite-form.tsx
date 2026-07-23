"use client";

import { useActionState } from "react";
import { acceptInviteAction, type ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function InviteForm({
  token,
  orgName,
  email,
  isExistingUser,
}: {
  token: string;
  orgName: string;
  email: string;
  isExistingUser: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(acceptInviteAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join {orgName}</CardTitle>
        <CardDescription>
          {isExistingUser
            ? `You already have an account for ${email}. Accept to join this organization.`
            : `Set a name and password to join as ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {!isExistingUser ? (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">Your name</Label>
                <Input id="name" name="name" required />
                {state?.fieldErrors?.name ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
                {state?.fieldErrors?.password ? (
                  <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <input type="hidden" name="name" value={email} />
              <input type="hidden" name="password" value="unused" />
            </>
          )}
          <SubmitButton className="mt-2 w-full" pendingText="Joining...">
            {isExistingUser ? "Accept invite" : "Create account & join"}
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
