"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction, type ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";

export function SignupForm({ googleEnabled }: { googleEnabled: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(signupAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your workspace</CardTitle>
        <CardDescription>Set up your organization in under a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        {googleEnabled ? (
          <div className="mb-6 flex flex-col gap-4">
            <GoogleSignInButton callbackUrl="/dashboard" />
            <p className="text-center text-xs text-muted-foreground">
              Signing up with Google creates a new organization for you automatically.
            </p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              OR
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        ) : null}
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input id="orgName" name="orgName" placeholder="Acme Consulting" required />
            {state?.fieldErrors?.orgName ? (
              <p className="text-sm text-destructive">{state.fieldErrors.orgName[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" placeholder="Jordan Lee" required />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            {state?.fieldErrors?.email ? (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
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
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 10 characters, with a letter and a number.
              </p>
            )}
          </div>
          <SubmitButton className="mt-2 w-full" pendingText="Creating workspace...">
            Create workspace
          </SubmitButton>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
