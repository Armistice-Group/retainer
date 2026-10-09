"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentTermsSelect } from "@/components/forms/payment-terms-select";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormSection, Field, FormActions } from "@/components/forms/form-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toDateInputValue } from "@/lib/format";
import type { ActionState } from "@/actions/auth";

type ProjectFormValues = {
  clientId: string;
  name: string;
  description: string | null;
  status: "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
  startDate: Date | null;
  endDate: Date | null;
  confidential: boolean;
  budgetHours: number | null;
  billingType: "HOURLY" | "FLAT_FEE" | "MILESTONE";
  flatFeeAmount: number | null;
  paymentTerms: string | null;
};

export function ProjectForm({
  action,
  clients,
  initialValues,
  defaultClientId,
  submitLabel,
  cancelHref,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  clients: { id: string; name: string; paymentTermsLabel: string }[];
  initialValues?: ProjectFormValues;
  defaultClientId?: string;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const [billingType, setBillingType] = useState(initialValues?.billingType ?? "HOURLY");
  const [clientId, setClientId] = useState(initialValues?.clientId ?? defaultClientId);
  const clientTerms = clients.find((c) => c.id === clientId)?.paymentTermsLabel;

  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction}>
      {state?.error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FormSection
        title="Project"
        description="What the work is and who it's for."
      >
        <Field id="name" label="Project name" error={errors.name} wide>
          <Input id="name" name="name" defaultValue={initialValues?.name} required />
        </Field>
        <Field id="clientId" label="Client" error={errors.clientId}>
          <Select name="clientId" defaultValue={clientId} onValueChange={setClientId}>
            <SelectTrigger id="clientId" className="w-full">
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="status" label="Status">
          <Select name="status" defaultValue={initialValues?.status ?? "ACTIVE"}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ON_HOLD">On hold</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="description" label="Description" wide>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initialValues?.description ?? ""}
            placeholder="Scope, goals, or anything worth remembering about this project."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Billing"
        description="How this work is charged. Hourly rates are set per person on the project page."
      >
        <Field id="billingType" label="Billing type">
          <Select
            name="billingType"
            defaultValue={billingType}
            onValueChange={(value) => setBillingType(value as typeof billingType)}
          >
            <SelectTrigger id="billingType" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="HOURLY">Hourly</SelectItem>
              <SelectItem value="FLAT_FEE">Flat fee</SelectItem>
              <SelectItem value="MILESTONE">Milestone-based</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        {billingType === "FLAT_FEE" ? (
          <Field id="flatFeeAmount" label="Flat fee amount" error={errors.flatFeeAmount}>
            <Input
              id="flatFeeAmount"
              name="flatFeeAmount"
              type="number"
              step="0.01"
              min="0"
              defaultValue={initialValues?.flatFeeAmount ?? ""}
              required
            />
          </Field>
        ) : null}
        <Field
          id="budgetHours"
          label="Budget (hours)"
          hint="Optional not-to-exceed cap."
          error={errors.budgetHours}
        >
          <Input
            id="budgetHours"
            name="budgetHours"
            type="number"
            step="0.25"
            min="0"
            defaultValue={initialValues?.budgetHours ?? ""}
          />
        </Field>
        <Field
          id="paymentTerms"
          label="Payment terms"
          hint="For invoices of only this project's work."
        >
          <PaymentTermsSelect
            id="paymentTerms"
            defaultValue={initialValues?.paymentTerms}
            inheritLabel={clientTerms ? `Same as client (${clientTerms})` : "Same as client"}
          />
        </Field>
      </FormSection>

      <FormSection title="Schedule & access">
        <Field id="startDate" label="Start date">
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={initialValues?.startDate ? toDateInputValue(initialValues.startDate) : ""}
          />
        </Field>
        <Field id="endDate" label="End date">
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={initialValues?.endDate ? toDateInputValue(initialValues.endDate) : ""}
          />
        </Field>
        <div className="flex items-start gap-2 sm:col-span-2">
          <Checkbox
            id="confidential"
            name="confidential"
            className="mt-0.5"
            defaultChecked={initialValues?.confidential}
          />
          <Label htmlFor="confidential" className="text-sm font-normal">
            Confidential — only people assigned to it (and owners/admins) can see it
          </Label>
        </div>
      </FormSection>

      <FormActions cancelHref={cancelHref}>
        <SubmitButton pendingText="Saving...">{submitLabel}</SubmitButton>
      </FormActions>
    </form>
  );
}
