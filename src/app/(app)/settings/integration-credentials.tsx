"use client";

import { useActionState, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CopyButton } from "@/components/copy-button";
import {
  saveIntegrationCredentialsAction,
  removeIntegrationCredentialsAction,
} from "@/actions/instance";
import type { ActionState } from "@/actions/auth";
import type { Integration } from "@/lib/instance-config";

export type CredentialField = {
  key: string;
  label: string;
  secret: boolean;
  options?: string[];
  source: "env" | "db" | null;
  value?: string;
};

/** Instance-wide credentials for one integration, editable by owners.
 * Collapsed to a one-line summary once configured. */
export function IntegrationCredentials({
  integration,
  fields,
  configured,
  canEdit,
  callbackUrl,
  /** Lower-case as it reads mid-sentence, e.g. "callback URL". */
  callbackLabel = "callback URL",
  appUrl,
  appLabel,
}: {
  integration: Integration;
  fields: CredentialField[];
  configured: boolean;
  canEdit: boolean;
  callbackUrl?: string;
  callbackLabel?: string;
  appUrl: string;
  appLabel: string;
}) {
  const [editing, setEditing] = useState(!configured);
  const allFromEnv = fields.every((f) => f.source === "env");
  const anyStored = fields.some((f) => f.source === "db");

  if (!canEdit) {
    return configured ? null : (
      <p className="text-sm text-muted-foreground">
        Not set up on this instance yet. An owner can add the credentials here.
      </p>
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted-foreground">
          {allFromEnv ? "Credentials set in the server environment." : "Credentials saved."}
        </span>
        {allFromEnv ? null : (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit credentials
            </Button>
            {anyStored ? (
              <form action={removeIntegrationCredentialsAction.bind(null, integration)}>
                <ConfirmSubmitButton
                  variant="ghost"
                  size="sm"
                  confirmMessage="Remove the saved credentials? Anything already connected stops working until they're added again."
                >
                  Remove
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <CredentialsForm
      integration={integration}
      fields={fields}
      callbackUrl={callbackUrl}
      callbackLabel={callbackLabel}
      appUrl={appUrl}
      appLabel={appLabel}
      onCancel={configured ? () => setEditing(false) : undefined}
      onSaved={() => setEditing(false)}
    />
  );
}

function CredentialsForm({
  integration,
  fields,
  callbackUrl,
  callbackLabel,
  appUrl,
  appLabel,
  onCancel,
  onSaved,
}: {
  integration: Integration;
  fields: CredentialField[];
  callbackUrl?: string;
  callbackLabel: string;
  appUrl: string;
  appLabel: string;
  onCancel?: () => void;
  onSaved: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveIntegrationCredentialsAction.bind(null, integration),
    null,
  );

  useEffect(() => {
    if (state?.saved) onSaved();
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <p className="text-sm text-muted-foreground">
        Get these from{" "}
        <a href={appUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
          {appLabel}
        </a>
        {callbackUrl ? <>, registering this {callbackLabel}:</> : "."}
      </p>
      {callbackUrl ? (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
            {callbackUrl}
          </code>
          <CopyButton value={callbackUrl} label="Copy" />
        </div>
      ) : null}
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {fields.map((field) => {
        const id = `${integration}-${field.key}`;
        const error = state?.fieldErrors?.[field.key]?.[0];
        return (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{field.label}</Label>
            {field.source === "env" ? (
              <p className="text-xs text-muted-foreground">
                Set in the server environment (<code>{field.key}</code>).
              </p>
            ) : field.options ? (
              <Select name={field.key} defaultValue={field.value ?? field.options[0]}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o.charAt(0).toUpperCase() + o.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                name={field.key}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                defaultValue={field.secret ? undefined : field.value}
                placeholder={
                  field.secret && field.source === "db" ? "Saved — leave blank to keep" : undefined
                }
              />
            )}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        );
      })}
      <div className="flex gap-2">
        <SubmitButton size="sm" pendingText="Saving...">
          Save credentials
        </SubmitButton>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
