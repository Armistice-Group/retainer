"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Link2, Mail, X } from "lucide-react";
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
import {
  emailEstimateAction,
  estimateClientLinkAction,
  markEstimateResponseAction,
} from "@/actions/estimates";
import type { ActionState } from "@/actions/auth";

export function EmailEstimateDialog({
  estimateId,
  estimateNumber,
  contacts,
  defaultRecipients,
  isDraft,
  emailConfigured,
}: {
  estimateId: string;
  estimateNumber: string;
  contacts: { name: string; email: string }[];
  defaultRecipients: string[];
  isDraft: boolean;
  emailConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await emailEstimateAction(estimateId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success(`Estimate ${estimateNumber} emailed.`);
    }
    return result;
  }, null);
  // The client's contacts, plus its main email if that's the default.
  const options = [
    ...contacts,
    ...defaultRecipients
      .filter((e) => !contacts.some((c) => c.email === e))
      .map((email) => ({ name: "", email })),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={isDraft ? "default" : "outline"}>
          <Mail /> {isDraft ? "Email to client" : "Email again"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Email estimate {estimateNumber}</DialogTitle>
          <DialogDescription>
            They get a link to read it, download the PDF, and accept or decline it.
            {isDraft ? " The estimate is marked as sent." : ""}
          </DialogDescription>
        </DialogHeader>
        {!emailConfigured ? (
          <Alert>
            <AlertDescription>
              Email isn&apos;t set up on this instance (Settings → Integrations). Use{" "}
              <strong>Copy client link</strong> and send it yourself.
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
              {options.length ? (
                options.map((c) => (
                  <label key={c.email} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      name="to"
                      value={c.email}
                      defaultChecked={defaultRecipients.includes(c.email)}
                    />
                    {c.name ? `${c.name} · ` : ""}
                    {c.email}
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  This client has no contacts with an email yet.
                </p>
              )}
              <Input
                name="extra"
                placeholder={options.length ? "Anyone else? (comma-separated)" : "client@example.com"}
                aria-label="Other recipients"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="estimate-message">Message (optional)</Label>
              <Textarea
                id="estimate-message"
                name="message"
                rows={3}
                placeholder="Here's the estimate we discussed. Let me know if you have questions."
              />
            </div>
            <SubmitButton pendingText="Sending...">Send estimate</SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CopyEstimateLinkButton({ estimateId, isDraft }: { estimateId: string; isDraft: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (isDraft && !window.confirm("Mark this estimate as sent and copy its client link?")) return;
        startTransition(async () => {
          const result = await estimateClientLinkAction(estimateId);
          if (!result.url) {
            toast.error(result.error ?? "Couldn't get the link.");
            return;
          }
          try {
            await navigator.clipboard.writeText(result.url);
            toast.success("Client link copied.");
          } catch {
            window.prompt("Copy the client link:", result.url);
          }
        });
      }}
    >
      <Link2 /> Copy client link
    </Button>
  );
}

export function MarkResponseDialog({
  estimateId,
  decision,
}: {
  estimateId: string;
  decision: "ACCEPTED" | "DECLINED";
}) {
  const [open, setOpen] = useState(false);
  const accepted = decision === "ACCEPTED";
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await markEstimateResponseAction(estimateId, decision, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success(accepted ? "Marked accepted." : "Marked declined.");
    }
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {accepted ? <Check /> : <X />} {accepted ? "Mark accepted" : "Mark declined"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{accepted ? "Mark accepted" : "Mark declined"}</DialogTitle>
          <DialogDescription>
            For when the client {accepted ? "accepted" : "declined"} by email, phone or in person.
            You&apos;re recorded as the person who marked it. This can&apos;t be undone.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`responder-${decision}`}>Who {accepted ? "accepted" : "declined"} (optional)</Label>
            <Input id={`responder-${decision}`} name="name" maxLength={200} placeholder="e.g. Dana Smith" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`note-${decision}`}>Note (optional)</Label>
            <Textarea
              id={`note-${decision}`}
              name="note"
              rows={3}
              maxLength={2000}
              placeholder={accepted ? "e.g. Accepted by email on 3 March" : "e.g. Went with another agency"}
            />
          </div>
          <SubmitButton pendingText="Saving...">{accepted ? "Mark accepted" : "Mark declined"}</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
