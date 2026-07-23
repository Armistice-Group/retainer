"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateOrgSettingsAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

type Org = {
  name: string;
  invoicePrefix: string;
  defaultCurrency: string;
  defaultTaxRate: string;
  externalBillingLabel: string | null;
  externalBillingUrl: string | null;
  slackWebhookUrl: string | null;
};

export function OrgSettingsForm({ org, readOnly }: { org: Org; readOnly: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrgSettingsAction,
    null
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" name="name" defaultValue={org.name} disabled={readOnly} required />
          {state?.fieldErrors?.name ? (
            <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invoicePrefix">Invoice number prefix</Label>
          <Input
            id="invoicePrefix"
            name="invoicePrefix"
            defaultValue={org.invoicePrefix}
            disabled={readOnly}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <Input
            id="defaultCurrency"
            name="defaultCurrency"
            defaultValue={org.defaultCurrency}
            disabled={readOnly}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="defaultTaxRate">Default tax rate (%)</Label>
          <Input
            id="defaultTaxRate"
            name="defaultTaxRate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={org.defaultTaxRate}
            disabled={readOnly}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="externalBillingLabel">External billing tool name</Label>
          <Input
            id="externalBillingLabel"
            name="externalBillingLabel"
            placeholder="e.g. Bill.com, Found"
            defaultValue={org.externalBillingLabel ?? ""}
            disabled={readOnly}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="externalBillingUrl">External billing tool link</Label>
          <Input
            id="externalBillingUrl"
            name="externalBillingUrl"
            placeholder="https://"
            defaultValue={org.externalBillingUrl ?? ""}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            A quick link to your accounting or payments platform for teams that generate invoices
            outside Retainer.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="slackWebhookUrl">Slack webhook URL</Label>
          <Input
            id="slackWebhookUrl"
            name="slackWebhookUrl"
            placeholder="https://hooks.slack.com/services/..."
            defaultValue={org.slackWebhookUrl ?? ""}
            disabled={readOnly}
          />
          {state?.fieldErrors?.slackWebhookUrl ? (
            <p className="text-sm text-destructive">{state.fieldErrors.slackWebhookUrl[0]}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Create an{" "}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Incoming Webhook
            </a>{" "}
            in Slack and paste the URL here. We&apos;ll post here when an invoice is sent or paid,
            and when time is logged.
          </p>
        </div>
      </div>

      {!readOnly ? (
        <div>
          <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
