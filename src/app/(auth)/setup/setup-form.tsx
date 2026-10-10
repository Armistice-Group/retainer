"use client";

import { useActionState } from "react";
import { completeSetupAction } from "@/actions/setup";
import type { ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";

function FieldError({ state, name }: { state: ActionState; name: string }) {
  const message = state?.fieldErrors?.[name]?.[0];
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function SetupForm({
  tokenRequired,
  detectedUrl,
}: {
  tokenRequired: boolean;
  detectedUrl: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(completeSetupAction, null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up your workspace</CardTitle>
        <CardDescription>
          This is a new installation. Create your organization and the owner account you&apos;ll
          use to manage it. This page closes for good once it&apos;s done.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {tokenRequired ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="setupToken">Setup token</Label>
              <Input
                id="setupToken"
                name="setupToken"
                type="password"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                The value of <code>SETUP_TOKEN</code>{" "}from this server&apos;s <code>.env</code>.
              </p>
              <FieldError state={state} name="setupToken" />
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor="orgName">Organization name</Label>
            <Input id="orgName" name="orgName" placeholder="Acme Consulting" required />
            <FieldError state={state} name="orgName" />
          </div>

          {detectedUrl ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="publicUrl">Instance URL</Label>
              <Input id="publicUrl" name="publicUrl" defaultValue={detectedUrl} required />
              <p className="text-xs text-muted-foreground">
                Detected from your browser. Used in links sent to people — invites, client invoice,
                share and review links — so change it if others will reach this instance at a
                different address (for example the HTTPS domain you&apos;ll put in front of it). The
                owner can change it later in Settings → General.
              </p>
              <FieldError state={state} name="publicUrl" />
            </div>
          ) : null}

          <div className="mt-2 border-t border-border pt-4">
            <p className="text-sm font-medium">Owner account</p>
            <p className="text-xs text-muted-foreground">
              The organization&apos;s owner. It can always sign in with a password, even after SSO
              is required — keep it as a break-glass login.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" name="name" autoComplete="name" required />
            <FieldError state={state} name="name" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
            <FieldError state={state} name="email" />
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
            <p className="text-xs text-muted-foreground">
              At least 10 characters, with a letter and a number.
            </p>
            <FieldError state={state} name="password" />
          </div>

          <SubmitButton className="mt-2 w-full" pendingText="Creating...">
            Create workspace
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
