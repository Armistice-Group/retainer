"use client";

import { useActionFeedback } from "@/components/forms/use-action-feedback";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { CLOCK_ROUNDING_OPTIONS, clockRoundingLabel } from "@/lib/clock-time";
import { COMMON_CURRENCIES, currencyLabel, supportedCurrencies } from "@/lib/currencies";
import type { ActionState } from "@/actions/auth";

type Org = {
  name: string;
  invoicePrefix: string;
  defaultCurrency: string;
  defaultTaxRate: string;
  defaultBillRate: string;
  defaultPaymentTerms: string;
  overheadPercent: string;
  expenseApprovalThreshold: string;
  timesheetApproval: string;
  clockRoundingMinutes: string;
  externalBillingLabel: string | null;
  externalBillingUrl: string | null;
  slackWebhookUrl: string | null;
  brandColor: string | null;
  businessAddress: string | null;
  taxId: string | null;
  nextInvoiceNumber: string;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

function FieldError({ errors }: { errors?: string[] }) {
  return errors?.[0] ? <p className="text-sm text-destructive">{errors[0]}</p> : null;
}

export function OrgSettingsForm({ org, readOnly }: { org: Org; readOnly: boolean }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateOrgGeneralAction,
    null
  );
  useActionFeedback(state, isPending, "Settings saved");
  const errors = state?.fieldErrors ?? {};
  const [brandColor, setBrandColor] = useState(org.brandColor ?? "");
  const [prefix, setPrefix] = useState(org.invoicePrefix);
  const [nextNumber, setNextNumber] = useState(org.nextInvoiceNumber);
  const currencies = useMemo(() => {
    const all = supportedCurrencies();
    const rest = all.filter((c) => !COMMON_CURRENCIES.includes(c));
    // Keep a stored code that isn't valid visible, so it can be fixed.
    const current = all.includes(org.defaultCurrency) ? [] : [org.defaultCurrency];
    return [...current, ...COMMON_CURRENCIES, ...rest];
  }, [org.defaultCurrency]);

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
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            disabled={readOnly}
            required
          />
          <FieldError errors={errors.invoicePrefix} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="nextInvoiceNumber">Next invoice number</Label>
          <Input
            id="nextInvoiceNumber"
            name="nextInvoiceNumber"
            type="number"
            min="1"
            step="1"
            value={nextNumber}
            onChange={(e) => setNextNumber(e.target.value)}
            disabled={readOnly}
            required
          />
          {errors.nextInvoiceNumber ? (
            <FieldError errors={errors.nextInvoiceNumber} />
          ) : (
            <p className="text-xs text-muted-foreground">
              The next invoice will be{" "}
              <span className="font-medium text-foreground">
                {prefix || "INV"}-{String(Number(nextNumber) || 1).padStart(4, "0")}
              </span>
              . Raise it to carry on from another tool.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="defaultCurrency">Default currency</Label>
          <Select name="defaultCurrency" defaultValue={org.defaultCurrency} disabled={readOnly}>
            <SelectTrigger id="defaultCurrency" className="w-full" aria-invalid={!!errors.defaultCurrency || undefined}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {currencies.map((code) => (
                <SelectItem key={code} value={code}>
                  {currencyLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors.defaultCurrency} />
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
        {readOnly ? null : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="defaultBillRate">Default bill rate ({org.defaultCurrency}/hr)</Label>
          <Input
            id="defaultBillRate"
            name="defaultBillRate"
            type="number"
            step="0.01"
            min="0"
            placeholder="Not set"
            defaultValue={org.defaultBillRate}
            disabled={readOnly}
          />
          {state?.fieldErrors?.defaultBillRate ? (
            <p className="text-sm text-destructive">{state.fieldErrors.defaultBillRate[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              What people start at when they&apos;re put on a project, unless they have their own
              rate under{" "}
              <Link href="/settings/members" className="text-brand hover:underline">
                Members
              </Link>
              . Changing it doesn&apos;t touch existing projects.
            </p>
          )}
        </div>
        )}
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
        {readOnly ? null : (
        <>
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
        </>
        )}
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
            People covered submit each week from Time; an owner or admin approves it before
            that time can be invoiced. Owners and admins approve rather than submit, so this
            changes nothing for a one-person organization.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="clockRoundingMinutes">Round clock times to</Label>
          <Select
            name="clockRoundingMinutes"
            defaultValue={org.clockRoundingMinutes}
            disabled={readOnly}
          >
            <SelectTrigger id="clockRoundingMinutes" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLOCK_ROUNDING_OPTIONS.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {clockRoundingLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            When time is logged with a start and end, the hours are rounded to this. The times
            themselves are kept as entered.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="brandColor">Brand color</Label>
          <div className="flex items-center gap-2">
            <label
              className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border"
              title={HEX.test(brandColor) ? brandColor : "No brand color — pick one"}
              style={
                HEX.test(brandColor)
                  ? { backgroundColor: brandColor }
                  : {
                      backgroundImage:
                        "linear-gradient(to top right, transparent calc(50% - 1px), var(--color-muted-foreground) calc(50% - 1px), var(--color-muted-foreground) calc(50% + 1px), transparent calc(50% + 1px))",
                    }
              }
            >
              <input
                type="color"
                aria-label="Brand color picker"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                value={HEX.test(brandColor) ? brandColor : "#4f6df5"}
                onChange={(e) => setBrandColor(e.target.value)}
                disabled={readOnly}
              />
            </label>
            <Input
              id="brandColor"
              name="brandColor"
              placeholder="None"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              disabled={readOnly}
            />
            {brandColor && !readOnly ? (
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setBrandColor("")}
              >
                Clear
              </button>
            ) : null}
          </div>
          {state?.fieldErrors?.brandColor ? (
            <p className="text-sm text-destructive">{state.fieldErrors.brandColor[0]}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Used on invoice PDFs, and as the app accent if turned on under Logo &amp; branding. Leave blank for the default.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="businessAddress">Business address</Label>
          <Textarea
            id="businessAddress"
            name="businessAddress"
            rows={3}
            placeholder={"123 Main St\nSpringfield, IL 62701"}
            defaultValue={org.businessAddress ?? ""}
            disabled={readOnly}
          />
          <FieldError errors={errors.businessAddress} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="taxId">Tax ID</Label>
          <Input
            id="taxId"
            name="taxId"
            placeholder="EIN, VAT or ABN number"
            defaultValue={org.taxId ?? ""}
            disabled={readOnly}
          />
          <FieldError errors={errors.taxId} />
          <p className="text-xs text-muted-foreground">
            The address and tax ID appear under your name on invoices. Leave blank to leave them off.
          </p>
        </div>
        <div className="hidden sm:block" />
        {readOnly ? null : (
        <>
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
        <div className="flex flex-col gap-2">
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
        </>
        )}
      </div>

      {!readOnly ? (
        <div>
          <SubmitButton pendingText="Saving...">Save changes</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
