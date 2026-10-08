"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { FormSection, Field, FormActions } from "@/components/forms/form-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionState } from "@/actions/auth";

type ClientFormValues = {
  name: string;
  website: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  billingEmail: string | null;
  billingAddress: string | null;
  status: "ACTIVE" | "INACTIVE";
};

export function ClientForm({
  action,
  initialValues,
  submitLabel,
  cancelHref,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  initialValues?: ClientFormValues;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction}>
      {state?.error ? (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FormSection
        title="Company"
        description="How this client appears across projects and invoices."
      >
        <Field id="name" label="Company name" error={errors.name} wide>
          <Input id="name" name="name" defaultValue={initialValues?.name} required />
        </Field>
        <Field id="website" label="Website" error={errors.website}>
          <Input
            id="website"
            name="website"
            defaultValue={initialValues?.website ?? ""}
            placeholder="acme.com"
          />
        </Field>
        <Field id="status" label="Status">
          <Select name="status" defaultValue={initialValues?.status ?? "ACTIVE"}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="description" label="Notes" wide>
          <Textarea
            id="description"
            name="description"
            rows={3}
            defaultValue={initialValues?.description ?? ""}
            placeholder="What they do, how the engagement started — anything worth remembering."
          />
        </Field>
      </FormSection>

      <FormSection
        title="Contact"
        description="General contact details. People you work with go under Points of contact."
      >
        <Field id="email" label="Email" error={errors.email}>
          <Input id="email" name="email" type="email" defaultValue={initialValues?.email ?? ""} />
        </Field>
        <Field id="phone" label="Phone">
          <Input id="phone" name="phone" defaultValue={initialValues?.phone ?? ""} />
        </Field>
        <Field id="address" label="Address" wide>
          <Input id="address" name="address" defaultValue={initialValues?.address ?? ""} />
        </Field>
      </FormSection>

      <FormSection
        title="Billing"
        description="Where invoices go, if different from the contact details. Leave blank to use those. Payment methods are on the client page."
      >
        <Field id="billingEmail" label="Billing email" error={errors.billingEmail}>
          <Input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={initialValues?.billingEmail ?? ""}
          />
        </Field>
        <Field id="billingAddress" label="Billing address">
          <Input
            id="billingAddress"
            name="billingAddress"
            defaultValue={initialValues?.billingAddress ?? ""}
          />
        </Field>
      </FormSection>

      <FormActions cancelHref={cancelHref}>
        <SubmitButton pendingText="Saving...">{submitLabel}</SubmitButton>
      </FormActions>
    </form>
  );
}
