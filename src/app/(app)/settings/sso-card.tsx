"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import { saveSsoConnectionAction, disconnectSsoAction, setSsoEnabledAction } from "@/actions/sso";
import type { ActionState } from "@/actions/auth";

export type SsoConnectionSummary = {
  issuer: string;
  clientId: string;
  displayName: string | null;
  allowedDomains: string[];
  autoProvision: boolean;
  defaultRole: "OWNER" | "ADMIN" | "MEMBER";
  enforced: boolean;
  trustEmails: boolean;
  enabled: boolean;
};

export function SsoCard({
  connection,
  callbackUrl,
  readOnly,
}: {
  connection: SsoConnectionSummary | null;
  callbackUrl: string;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(!connection);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Single sign-on (OIDC)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Works with any OpenID Connect provider — Okta, Entra ID, Google Workspace, Authentik,
          Keycloak, Zitadel, Auth0. Once enabled, a sign-in button for it appears on the login
          page.
        </p>

        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <Label className="text-xs text-muted-foreground">
            Redirect URI — register this with your identity provider
          </Label>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-sm">{callbackUrl}</code>
            <CopyButton value={callbackUrl} label="Copy" />
          </div>
        </div>

        {connection && !editing ? (
          <ConnectionSummary
            connection={connection}
            readOnly={readOnly}
            onEdit={() => setEditing(true)}
          />
        ) : readOnly ? (
          <p className="text-sm text-muted-foreground">Not configured.</p>
        ) : (
          <SsoForm
            connection={connection}
            onSaved={() => setEditing(false)}
            onCancel={connection ? () => setEditing(false) : undefined}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionSummary({
  connection,
  readOnly,
  onEdit,
}: {
  connection: SsoConnectionSummary;
  readOnly: boolean;
  onEdit: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{connection.displayName || "SSO"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {connection.enabled ? (
              <CheckCircle2 className="size-3.5 shrink-0 text-chart-3" />
            ) : (
              <CircleSlash className="size-3.5 shrink-0" />
            )}
            <span className="truncate">{connection.issuer}</span>
          </p>
        </div>
        {readOnly ? null : (
          <div className="flex shrink-0 items-center gap-2">
            <Checkbox
              id="sso-enabled"
              checked={connection.enabled}
              disabled={isPending}
              onCheckedChange={(checked) =>
                startTransition(() => setSsoEnabledAction(checked === true))
              }
            />
            <Label htmlFor="sso-enabled" className="font-normal">
              Enabled
            </Label>
          </div>
        )}
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">New users</dt>
        <dd>
          {connection.autoProvision
            ? `Created on first sign-in as ${connection.defaultRole === "ADMIN" ? "Admin" : "Member"}`
            : "Invite only"}
        </dd>
        <dt className="text-muted-foreground">Domains</dt>
        <dd>{connection.allowedDomains.length ? connection.allowedDomains.join(", ") : "Any"}</dd>
        <dt className="text-muted-foreground">Unverified emails</dt>
        <dd>{connection.trustEmails ? "Trusted" : "Rejected"}</dd>
        <dt className="text-muted-foreground">Enforced</dt>
        <dd>{connection.enforced ? "Yes — owners keep password login" : "No"}</dd>
      </dl>

      {readOnly ? null : (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <form action={disconnectSsoAction}>
            <ConfirmSubmitButton
              variant="outline"
              size="sm"
              confirmMessage="Remove this SSO connection? Members without a password will no longer be able to sign in."
            >
              Remove
            </ConfirmSubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}

function SsoForm({
  connection,
  onSaved,
  onCancel,
}: {
  connection: SsoConnectionSummary | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveSsoConnectionAction, null);

  useEffect(() => {
    if (state?.saved) onSaved();
  }, [state, onSaved]);

  const fieldError = (name: string) =>
    state?.fieldErrors?.[name] ? (
      <p className="text-sm text-destructive">{state.fieldErrors[name][0]}</p>
    ) : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="sso-issuer">Issuer URL</Label>
        <Input
          id="sso-issuer"
          name="issuer"
          placeholder="https://auth.example.com/application/o/consultainer/"
          defaultValue={connection?.issuer}
          required
        />
        {fieldError("issuer") ?? (
          <p className="text-xs text-muted-foreground">
            We fetch <code>/.well-known/openid-configuration</code> from this URL. Authentik:
            the provider&apos;s &ldquo;OpenID Configuration Issuer&rdquo;. Okta:{" "}
            <code>https://your-org.okta.com</code>.
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sso-clientId">Client ID</Label>
          <Input
            id="sso-clientId"
            name="clientId"
            defaultValue={connection?.clientId}
            required
          />
          {fieldError("clientId")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sso-clientSecret">Client secret</Label>
          <Input
            id="sso-clientSecret"
            name="clientSecret"
            type="password"
            autoComplete="off"
            placeholder={connection ? "Unchanged" : undefined}
            required={!connection}
          />
          {fieldError("clientSecret")}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sso-displayName">Button label</Label>
        <Input
          id="sso-displayName"
          name="displayName"
          placeholder="Okta"
          defaultValue={connection?.displayName ?? ""}
          maxLength={60}
        />
        <p className="text-xs text-muted-foreground">
          Shown on the login page as &ldquo;Sign in with …&rdquo;.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sso-allowedDomains">Allowed email domains</Label>
        <Input
          id="sso-allowedDomains"
          name="allowedDomains"
          placeholder="acme.com, acme.co.uk"
          defaultValue={connection?.allowedDomains.join(", ") ?? ""}
        />
        <p className="text-xs text-muted-foreground">
          Leave blank to accept any verified email your identity provider returns.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-start gap-2">
          <Checkbox
            id="sso-autoProvision"
            name="autoProvision"
            defaultChecked={connection?.autoProvision ?? true}
            className="mt-0.5"
          />
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="sso-autoProvision" className="font-normal">
              Create accounts on first sign-in
            </Label>
            <p className="text-xs text-muted-foreground">
              Off: only people already in the organization (invited) can sign in with SSO.
            </p>
            <div className="flex items-center gap-2">
              <Label htmlFor="sso-defaultRole" className="text-xs font-normal text-muted-foreground">
                New accounts join as
              </Label>
              <Select name="defaultRole" defaultValue={connection?.defaultRole === "ADMIN" ? "ADMIN" : "MEMBER"}>
                <SelectTrigger id="sso-defaultRole" size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEMBER">Member</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="sso-trustEmails"
            name="trustEmails"
            defaultChecked={connection?.trustEmails ?? false}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="sso-trustEmails" className="font-normal">
              Trust email addresses from this provider
            </Label>
            <p className="text-xs text-muted-foreground">
              Needed for Authentik 2025.10+, which marks every email unverified by default. Only
              turn on if users can&apos;t change their own email in the identity provider — the
              email is what links a sign-in to an existing account.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="sso-enforced"
            name="enforced"
            defaultChecked={connection?.enforced ?? false}
            className="mt-0.5"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="sso-enforced" className="font-normal">
              Require SSO
            </Label>
            <p className="text-xs text-muted-foreground">
              Blocks password, passkey, and Google sign-in for everyone except owners, who keep
              local login in case the identity provider is unavailable.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <SubmitButton pendingText="Checking issuer...">
          {connection ? "Save" : "Connect"}
        </SubmitButton>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
