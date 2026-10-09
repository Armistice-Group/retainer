"use client";

import { useActionState, useState, useTransition } from "react";
import { Link2, Mail } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { emailInvoiceAction, invoiceClientLinkAction } from "@/actions/invoices";
import type { ActionState } from "@/actions/auth";

export function EmailInvoiceDialog({
  invoiceId,
  invoiceNumber,
  recipients,
  isDraft,
  emailConfigured,
}: {
  invoiceId: string;
  invoiceNumber: string;
  /** Default recipients: invoice contacts, else the billing email. */
  recipients: string[];
  isDraft: boolean;
  emailConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await emailInvoiceAction(invoiceId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success(`Invoice ${invoiceNumber} emailed.`);
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isDraft ? "default" : "outline"}>
          <Mail /> {isDraft ? "Email to client" : "Email again"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            They get a link to view, download and pay it. You&apos;ll be alerted when they open
            it.{isDraft ? " The invoice is marked as sent." : ""}
          </DialogDescription>
        </DialogHeader>
        {!emailConfigured ? (
          <Alert>
            <AlertDescription>
              Email isn&apos;t set up on this instance (Settings → Integrations). Use{" "}
              <strong>Copy client link</strong> to send it yourself — opens are still tracked.
            </AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label>To</Label>
              {recipients.length ? (
                recipients.map((email) => (
                  <label key={email} className="flex items-center gap-2 text-sm">
                    <Checkbox name="to" value={email} defaultChecked />
                    {email}
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  This client has no billing email or invoice contacts yet.
                </p>
              )}
              <Input
                name="extra"
                placeholder={recipients.length ? "Anyone else? (comma-separated)" : "client@example.com"}
                aria-label="Other recipients"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invoice-message">Message (optional)</Label>
              <Textarea
                id="invoice-message"
                name="message"
                rows={3}
                placeholder="Thanks for your business! Let me know if you have any questions."
              />
            </div>
            <SubmitButton pendingText="Sending...">Send invoice</SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CopyClientLinkButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await invoiceClientLinkAction(invoiceId);
          if (!result.url) {
            toast.error(result.error ?? "Couldn't get the link.");
            return;
          }
          try {
            await navigator.clipboard.writeText(result.url);
            toast.success("Client link copied — opens are tracked.");
          } catch {
            window.prompt("Copy the client link:", result.url);
          }
        })
      }
    >
      <Link2 /> Copy client link
    </Button>
  );
}
