"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { Button } from "@/components/ui/button";
import { DocsLink } from "@/components/docs-link";
import { removeIntegrationCredentialsAction, saveEmailSettingsAction } from "@/actions/instance";
import type { ActionState } from "@/actions/auth";
import type { FieldDescription } from "@/lib/instance-config";
import type { EmailProvider } from "@/lib/email";
import { TestEmailButton } from "./test-email-button";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: EmailProvider; label: string; hint: string }[] = [
  { id: "resend", label: "Resend", hint: "An API key from resend.com. Quickest to set up." },
  {
    id: "smtp",
    label: "SMTP",
    hint: "Any mail service or server: Postmark, Amazon SES, Mailgun, SendGrid, Google Workspace, Microsoft 365, your own.",
  },
];

/** Where common services' SMTP settings are, to save a search. */
const SMTP_EXAMPLES = [
  ["Postmark", "smtp.postmarkapp.com", "587", "server API token as username and password"],
  ["Amazon SES", "email-smtp.<region>.amazonaws.com", "587", "SMTP credentials from the SES console"],
  ["Mailgun", "smtp.mailgun.org", "587", "a domain's SMTP login"],
  ["Google Workspace", "smtp.gmail.com", "465", "your address and an app password"],
  ["Microsoft 365", "smtp.office365.com", "587", "a mailbox with SMTP AUTH allowed"],
] as const;

/**
 * How outgoing email is sent, for owners: Resend or SMTP, the from address,
 * and a test send. Used on Settings → Integrations and on the welcome page.
 */
export function EmailSettings({
  fields,
  provider: savedProvider,
  configured,
  canEdit,
  userEmail,
}: {
  fields: FieldDescription[];
  provider: EmailProvider;
  configured: boolean;
  canEdit: boolean;
  /** Where the test email goes. */
  userEmail: string | null;
}) {
  const field = (key: string) => fields.find((f) => f.key === key);
  const [provider, setProvider] = useState<EmailProvider>(savedProvider);
  const [editing, setEditing] = useState(!configured);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await saveEmailSettingsAction(prev, formData);
    if (result?.saved) setEditing(false);
    return result;
  }, null);
  const providerFromEnv = field("EMAIL_PROVIDER")?.source === "env";
  const anyStored = fields.some((f) => f.source === "db");

  const test = userEmail ? <TestEmailButton email={userEmail} /> : null;

  if (!canEdit) {
    return configured ? (
      test
    ) : (
      <p className="text-sm text-muted-foreground">
        Not set up yet. The owner can set it up here.
      </p>
    );
  }

  // After Remove there's nothing left to show: back to the empty form.
  if (!editing && (configured || anyStored)) {
    return (
      <div className="flex flex-col gap-4">
        {state?.saved ? (
          <Alert>
            <AlertDescription>Saved. Send yourself a test to check it works.</AlertDescription>
          </Alert>
        ) : null}
        {test}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change settings
          </Button>
          {anyStored ? (
            <form action={removeIntegrationCredentialsAction.bind(null, "email")}>
              <ConfirmSubmitButton
                variant="ghost"
                size="sm"
                confirmMessage="Remove the saved email settings? Invoices, invites and login links stop being emailed until it's set up again."
              >
                Remove
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>
    );
  }

  const error = (key: string) => state?.fieldErrors?.[key]?.[0];
  const input = (key: string, props: React.ComponentProps<typeof Input> = {}) => {
    const f = field(key);
    const id = `email-${key}`;
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{f?.label ?? key}</Label>
        {f?.source === "env" ? (
          <p className="text-xs text-muted-foreground">
            Set in the server environment (<code>{key}</code>).
          </p>
        ) : (
          <Input
            id={id}
            name={key}
            autoComplete="off"
            type={f?.secret ? "password" : "text"}
            defaultValue={f?.secret ? undefined : f?.value}
            placeholder={f?.secret && f.source === "db" ? "Saved — leave blank to keep" : props.placeholder}
            aria-invalid={!!error(key) || undefined}
            {...props}
          />
        )}
        {error(key) ? <p className="text-sm text-destructive">{error(key)}</p> : null}
      </div>
    );
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="flex flex-col gap-2" disabled={providerFromEnv}>
        <legend className="mb-2 text-sm font-medium">Send with</legend>
        <input type="hidden" name="EMAIL_PROVIDER" value={provider} />
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <label
              key={p.id}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-sm",
                provider === p.id ? "border-primary ring-1 ring-primary" : "border-border hover:bg-muted/50"
              )}
            >
              <span className="flex items-center gap-2 font-medium">
                <input
                  type="radio"
                  name="provider-choice"
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => setProvider(p.id)}
                  className="accent-primary"
                />
                {p.label}
              </span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </label>
          ))}
        </div>
        {providerFromEnv ? (
          <p className="text-xs text-muted-foreground">
            Set in the server environment (<code>EMAIL_PROVIDER</code>).
          </p>
        ) : null}
      </fieldset>

      {provider === "resend" ? (
        <>
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
              Sign up at{" "}
              <a href="https://resend.com/domains" target="_blank" rel="noreferrer" className="text-brand hover:underline">
                resend.com
              </a>{" "}
              and add the domain you&apos;ll send from under <strong>Domains</strong> (a subdomain
              like mail.example.com works well).
            </li>
            <li>Add the DNS records it shows and wait for <strong>Verified</strong>.</li>
            <li>
              Under <strong>API Keys</strong>, create a key with <strong>Sending access</strong> and
              paste it here.
            </li>
          </ol>
          {input("RESEND_API_KEY", { placeholder: "re_…" })}
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            {input("SMTP_HOST", { placeholder: "smtp.example.com" })}
            {input("SMTP_PORT", { placeholder: "587", inputMode: "numeric" })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {input("SMTP_USER")}
            {input("SMTP_PASSWORD")}
          </div>
          <p className="text-xs text-muted-foreground">
            Port 587 upgrades to TLS (STARTTLS); 465 is TLS from the start. Leave the username
            blank for a relay that doesn&apos;t need a login.
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Settings for common services</summary>
            <ul className="mt-2 space-y-1">
              {SMTP_EXAMPLES.map(([name, host, port, login]) => (
                <li key={name}>
                  <strong className="text-foreground">{name}</strong>: <code>{host}</code>, port {port}, {login}.
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      {input("EMAIL_FROM", {
        placeholder: "Acme Consulting <billing@example.com>",
      })}
      <p className="-mt-2 text-xs text-muted-foreground">
        {provider === "resend"
          ? "An address on your verified domain. Without one, mail only reaches your own Resend account."
          : "An address your mail service lets you send as."}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" pendingText="Saving...">
          Save
        </SubmitButton>
        {configured ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
        <span className="ml-auto">
          <DocsLink page="integrations/email" />
        </span>
      </div>
    </form>
  );
}
