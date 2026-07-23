"use client";

import { useActionState } from "react";
import { createOrgAction, type ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";

export default function OnboardingPage() {
  const [state, formAction] = useActionState<ActionState, FormData>(createOrgAction, null);

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your organization</CardTitle>
          <CardDescription>You need a workspace before you can continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="orgName">Organization name</Label>
              <Input id="orgName" name="orgName" placeholder="Acme Consulting" required />
              {state?.fieldErrors?.orgName ? (
                <p className="text-sm text-destructive">{state.fieldErrors.orgName[0]}</p>
              ) : null}
            </div>
            <SubmitButton className="w-full" pendingText="Creating...">
              Continue
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
