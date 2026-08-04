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
};

export function ProjectForm({
  action,
  clients,
  initialValues,
  defaultClientId,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  clients: { id: string; name: string }[];
  initialValues?: ProjectFormValues;
  defaultClientId?: string;
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
          <Label htmlFor="name">Project name</Label>
          <Input id="name" name="name" defaultValue={initialValues?.name} required />
          {state?.fieldErrors?.name ? (
            <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="clientId">Client</Label>
          <Select name="clientId" defaultValue={initialValues?.clientId ?? defaultClientId}>
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
          {state?.fieldErrors?.clientId ? (
            <p className="text-sm text-destructive">{state.fieldErrors.clientId[0]}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Status</Label>
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
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="startDate">Start date</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={initialValues?.startDate ? toDateInputValue(initialValues.startDate) : ""}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="endDate">End date</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={initialValues?.endDate ? toDateInputValue(initialValues.endDate) : ""}
          />
        </div>

        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={initialValues?.description ?? ""}
            placeholder="Scope, goals, or anything worth remembering about this project."
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="budgetHours">Budget (hours)</Label>
          <Input
            id="budgetHours"
            name="budgetHours"
            type="number"
            step="0.25"
            min="0"
            defaultValue={initialValues?.budgetHours ?? ""}
            placeholder="Optional — not-to-exceed cap"
          />
          {state?.fieldErrors?.budgetHours ? (
            <p className="text-sm text-destructive">{state.fieldErrors.budgetHours[0]}</p>
          ) : null}
        </div>

        <div className="flex items-end pb-2.5">
          <div className="flex items-center gap-2">
            <Checkbox
              id="confidential"
              name="confidential"
              defaultChecked={initialValues?.confidential}
            />
            <Label htmlFor="confidential" className="font-normal">
              Confidential — only assigned team members (and owners/admins) can see it
            </Label>
          </div>
        </div>
      </div>

      <div>
        <SubmitButton pendingText="Saving...">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
