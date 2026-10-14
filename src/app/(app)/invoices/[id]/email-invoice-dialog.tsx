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
  emailed,
  emailConfigured,
}: {
  invoiceId: string;
  invoiceNumber: string;
  /** Default recipients: invoice contacts, else the billing email. */
  recipients: string[];
  isDraft: boolean;
  /** It's been emailed before (so the button says "Email again"). */
  emailed: boolean;
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
        <Button size="sm" variant={isDraft && emailConfigured ? "default" : "outline"}>
          <Mail /> {emailed ? "Email again" : "Email to client"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            They get a link to view, download and pay it, and you see under Activity when they
            open it.{isDraft ? " The invoice is marked as sent." : ""}
          </DialogDescription>
        </DialogHeader>
        {!emailConfigured ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>
                Email isn&apos;t set up on this instance (Settings → Integrations), so send the
                client its link yourself. Opens are still tracked.
              </AlertDescription>
            </Alert>
            <CopyClientLinkButton invoiceId={invoiceId} isDraft={isDraft} primary onDone={() => setOpen(false)} />
          </div>
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

/**
 * Copies the invoice's client link. On a draft it marks the invoice as sent
 * first ("Send & copy link"), for sending it yourself.
 */
export function CopyClientLinkButton({
  invoiceId,
  isDraft = false,
  primary = false,
  onDone,
}: {
  invoiceId: string;
  isDraft?: boolean;
  primary?: boolean;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      disabled={pending}
      title={isDraft ? "Marks the invoice as sent and copies the link to send the client" : undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await invoiceClientLinkAction(invoiceId);
          if (!result.url) {
            toast.error(result.error ?? "Couldn't get the link.");
            return;
          }
          const what = result.sent ? "Marked as sent. Client link copied" : "Client link copied";
          try {
            await navigator.clipboard.writeText(result.url);
            toast.success(`${what}. Opens are tracked.`);
          } catch {
            if (result.sent) toast.success("Marked as sent.");
            window.prompt("Copy the client link:", result.url);
          }
          onDone?.();
        })
      }
    >
      <Link2 /> {isDraft ? "Send & copy link" : "Copy client link"}
    </Button>
  );
}
