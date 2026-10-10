"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PaymentTermsSelect } from "@/components/forms/payment-terms-select";
import { updateOrgGeneralAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

type Org = {
  name: string;
  invoicePrefix: string;
  defaultCurrency: string;
  defaultTaxRate: string;
  defaultPaymentTerms: string;
  overheadPercent: string;
  expenseApprovalThreshold: string;
  timesheetApproval: string;
  externalBillingLabel: string | null;
  externalBillingUrl: string | null;
  slackWebhookUrl: string | null;
  brandColor: string | null;
};

export function OrgSettingsForm({ org, readOnly }: { org: Org; readOnly: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateOrgGeneralAction,
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
          <Label htmlFor="defaultPaymentTerms">Default payment terms</Label>
          <PaymentTermsSelect
            id="defaultPaymentTerms"
            name="defaultPaymentTerms"
            defaultValue={org.defaultPaymentTerms}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            Clients and projects can set their own.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="overheadPercent">Overhead (%)</Label>
          <Input
            id="overheadPercent"
            name="overheadPercent"
            type="number"
            step="0.01"
            min="0"
            defaultValue={org.overheadPercent}
            disabled={readOnly}
            required
          />
          <p className="text-xs text-muted-foreground">
            Added to the billed rate on every hourly line item when an invoice is generated —
            baked into the rate shown, never broken out as its own line.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="expenseApprovalThreshold">Expense approval threshold</Label>
          <Input
            id="expenseApprovalThreshold"
            name="expenseApprovalThreshold"
            type="number"
            step="0.01"
            min="0"
            defaultValue={org.expenseApprovalThreshold}
            disabled={readOnly}
            required
          />
          <p className="text-xs text-muted-foreground">
            A team member&apos;s logged expense above this amount needs admin approval before it
            can be invoiced. Admins&apos; own expenses are always auto-approved.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="timesheetApproval">Timesheet approval</Label>
          <Select
            name="timesheetApproval"
            defaultValue={org.timesheetApproval}
            disabled={readOnly}
          >
            <SelectTrigger id="timesheetApproval" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OFF">Off</SelectItem>
              <SelectItem value="CONTRACTORS">Contractors</SelectItem>
              <SelectItem value="EVERYONE">Everyone except admins</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            People covered submit each week from Time; an admin approves it before that time
            can be invoiced.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="brandColor">Brand color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Brand color picker"
              className="size-9 shrink-0 cursor-pointer rounded-md border"
              value={/^#[0-9a-fA-F]{6}$/.test(org.brandColor ?? "") ? (org.brandColor as string) : "#4f6df5"}
              onChange={(e) => {
                const input = document.getElementById("brandColor") as HTMLInputElement | null;
                if (input) input.value = e.target.value;
              }}
              disabled={readOnly}
            />
            <Input
              id="brandColor"
              name="brandColor"
              placeholder="#4f6df5"
              defaultValue={org.brandColor ?? ""}
              disabled={readOnly}
            />
          </div>
          {state?.fieldErrors?.brandColor ? (
            <p className="text-sm text-destructive">{state.fieldErrors.brandColor[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Used on invoice PDFs, and as the app accent if turned on under Logo &amp; branding. Leave blank for the default.
            </p>
          )}
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
            outside Consultainer.
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
            In Slack, create an app, turn on{" "}
            <a
              href="https://api.slack.com/messaging/webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline"
            >
              Incoming Webhooks
            </a>
            , add a webhook to a channel and paste its URL here. Choose which alerts post to
            Slack under{" "}
            <Link href="/settings/alerts" className="text-brand hover:underline">
              Settings → Alerts
            </Link>
            .
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
