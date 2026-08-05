"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { submitContactFormAction, type ContactFormState } from "@/actions/contact";

export function ContactForm() {
  const [state, formAction] = useActionState<ContactFormState, FormData>(
    submitContactFormAction,
    null
  );

  if (state?.submitted) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm">
            Thanks — we got your message and will get back to you shortly.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          {/* Honeypot — hidden from real users, bots tend to fill every field. */}
          <div className="hidden" aria-hidden="true">
            <Label htmlFor="website">Website</Label>
            <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" name="name" required />
            {state?.fieldErrors?.name ? (
              <p className="text-sm text-destructive">{state.fieldErrors.name[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" name="email" type="email" required />
            {state?.fieldErrors?.email ? (
              <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-company">Company (optional)</Label>
            <Input id="contact-company" name="company" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea id="contact-message" name="message" rows={5} required />
            {state?.fieldErrors?.message ? (
              <p className="text-sm text-destructive">{state.fieldErrors.message[0]}</p>
            ) : null}
          </div>
          <SubmitButton pendingText="Sending...">Send message</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
