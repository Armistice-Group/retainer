"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createContactAction, updateContactAction } from "@/actions/clients";
import type { ActionState } from "@/actions/auth";

type ContactFormValues = {
  id: string;
  name: string;
  title: string | null;
  contactRole: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  receivesInvoices: boolean;
};

export function ContactDialog({
  clientId,
  contact,
}: {
  clientId: string;
  contact?: ContactFormValues;
}) {
  const isEdit = !!contact;
  const [open, setOpen] = useState(false);
  const action = isEdit ? updateContactAction.bind(null, contact.id) : createContactAction;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <Button variant="ghost" size="icon" className="size-7">
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <Plus className="size-3.5" /> Add contact
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit point of contact" : "Add a point of contact"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="clientId" value={clientId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" name="name" defaultValue={contact?.name} required />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-title">Title</Label>
              <Input
                id="contact-title"
                name="title"
                defaultValue={contact?.title ?? ""}
                placeholder="e.g. VP of Operations"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-role">Role</Label>
              <Input
                id="contact-role"
                name="contactRole"
                defaultValue={contact?.contactRole ?? ""}
                placeholder="e.g. Billing, Decision maker"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-email">Email</Label>
              <Input id="contact-email" name="email" type="email" defaultValue={contact?.email ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <Input id="contact-phone" name="phone" defaultValue={contact?.phone ?? ""} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <Checkbox id="contact-primary" name="isPrimary" defaultChecked={contact?.isPrimary} />
              <Label htmlFor="contact-primary" className="font-normal">
                Primary contact
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="contact-invoices"
                name="receivesInvoices"
                defaultChecked={contact?.receivesInvoices}
              />
              <Label htmlFor="contact-invoices" className="font-normal">
                Include on invoice emails
              </Label>
            </div>
          </div>
          <SubmitButton pendingText={isEdit ? "Saving..." : "Adding..."}>
            {isEdit ? "Save changes" : "Add contact"}
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
