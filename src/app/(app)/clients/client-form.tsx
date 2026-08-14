"use client";

import { useActionState } from "react";
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
import { SubmitButton } from "@/components/forms/submit-button";
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
  paymentInstructions: string | null;
  paymentInstructionsPrivate: boolean;
  status: "ACTIVE" | "INACTIVE";
};

export function ClientForm({
  action,
  initialValues,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  initialValues?: ClientFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="name">Company name</Label>
          <Input id="name" name="name" defaultValue={initialValues?.name} required />
          {state?.fieldErrors?.name ? (
            <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="website">Website / domain</Label>
          <Input
            id="website"
            name="website"
            defaultValue={initialValues?.website ?? ""}
            placeholder="acme.com"
          />
          {state?.fieldErrors?.website ? (
            <p className="text-sm text-destructive">{state.fieldErrors.website[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={initialValues?.address ?? ""} placeholder="Optional" />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={initialValues?.phone ?? ""} placeholder="Optional" />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <div className="mt-1 mb-0.5 border-t border-border pt-4">
            <p className="text-sm font-medium">Billing / Accounts Payable</p>
            <p className="text-xs text-muted-foreground">Optional — where invoices should go, if different.</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="billingEmail">Billing email</Label>
          <Input
            id="billingEmail"
            name="billingEmail"
            type="email"
            defaultValue={initialValues?.billingEmail ?? ""}
            placeholder="Defaults to email below if left blank"
          />
          {state?.fieldErrors?.billingEmail ? (
            <p className="text-sm text-destructive">{state.fieldErrors.billingEmail[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="billingAddress">Billing address</Label>
          <Input
            id="billingAddress"
            name="billingAddress"
            defaultValue={initialValues?.billingAddress ?? ""}
            placeholder="Defaults to address above if left blank"
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="paymentInstructions">Payment instructions (optional override)</Label>
          <Textarea
            id="paymentInstructions"
            name="paymentInstructions"
            rows={3}
            defaultValue={initialValues?.paymentInstructions ?? ""}
            placeholder="Leave blank to use your org's default payment instructions"
          />
          <div className="flex items-start gap-2">
            <Checkbox
              id="paymentInstructionsPrivate"
              name="paymentInstructionsPrivate"
              className="mt-0.5"
              defaultChecked={initialValues?.paymentInstructionsPrivate ?? false}
            />
            <Label htmlFor="paymentInstructionsPrivate" className="text-sm font-normal">
              Keep this off the PDF for this client — show it only on their secure share portal
            </Label>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2 border-t border-border pt-4">
          <Label htmlFor="email">General email</Label>
          <Input id="email" name="email" type="email" defaultValue={initialValues?.email ?? ""} placeholder="Optional" />
          {state?.fieldErrors?.email ? (
            <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={initialValues?.description ?? ""}
            placeholder="What does this client do? Any context worth remembering."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue={initialValues?.status ?? "ACTIVE"}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <SubmitButton pendingText="Saving...">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
