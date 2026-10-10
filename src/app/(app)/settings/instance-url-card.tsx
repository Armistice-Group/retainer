"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { savePublicUrlAction } from "@/actions/instance";
import type { ActionState } from "@/actions/auth";

export function InstanceUrlCard({
  configuredUrl,
  currentUrl,
  envOverride,
}: {
  configuredUrl: string | null;
  currentUrl: string;
  envOverride: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(savePublicUrlAction, null);
  const effective = envOverride ?? configuredUrl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Instance URL</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          The address used in links sent to people — invites, client invoice, share and review
          links, emails. Set it to the address everyone uses, such as your HTTPS domain. Sign-in
          and SSO redirects follow the address you&apos;re browsing on.
        </p>
        {envOverride ? (
          <>
            <p className="text-sm">
              Set by <code>AUTH_URL</code>: <code>{envOverride}</code>
            </p>
            <p className="text-xs text-muted-foreground">
              To change it, edit <code>AUTH_URL</code>{" "}in the server&apos;s <code>.env</code> and run{" "}
              <code>docker compose up -d</code>. While it&apos;s set, sign-in redirects use it too.
            </p>
          </>
        ) : (
          <form action={formAction} className="flex flex-col gap-2">
            <Label htmlFor="publicUrl">URL</Label>
            <Input
              id="publicUrl"
              name="publicUrl"
              defaultValue={configuredUrl ?? currentUrl}
              key={configuredUrl ?? currentUrl}
              required
            />
            {state?.fieldErrors?.publicUrl ? (
              <p className="text-sm text-destructive">{state.fieldErrors.publicUrl[0]}</p>
            ) : !configuredUrl ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Not confirmed yet — links currently use whichever address they&apos;re created from.
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <SubmitButton size="sm" pendingText="Saving...">
                Save
              </SubmitButton>
              {state?.saved ? <span className="text-xs text-muted-foreground">Saved</span> : null}
            </div>
          </form>
        )}
        {effective && effective !== currentUrl ? (
          <p className="text-xs text-muted-foreground">
            You&apos;re browsing on <code>{currentUrl}</code>.{" "}
            {envOverride ? null : (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                onClick={() => {
                  const input = document.getElementById("publicUrl") as HTMLInputElement | null;
                  if (input) input.value = currentUrl;
                }}
              >
                Use this address
              </Button>
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
