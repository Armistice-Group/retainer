"use client";

import { useActionState, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { respondToEstimateAction, type EstimateResponseState } from "@/actions/estimate-response";

/** Accept / Decline on the client's estimate page. Picking one shows a
 * short form (name, optional note); submitting disables the button, and the
 * server only records the first response anyway. */
export function RespondForm({ token, orgName }: { token: string; orgName: string }) {
  const [decision, setDecision] = useState<"ACCEPT" | "DECLINE" | null>(null);
  const [state, formAction] = useActionState<EstimateResponseState, FormData>(
    respondToEstimateAction.bind(null, token),
    null
  );

  if (state?.status) {
    const text =
      state.status === "ACCEPTED"
        ? `Accepted. ${orgName} has been told and will be in touch.`
        : state.status === "DECLINED"
          ? `Declined. ${orgName} has been told.`
          : state.status === "EXPIRED"
            ? "This estimate has expired, so it can't be accepted any more."
            : "This estimate can't be answered any more.";
    return (
      <Alert>
        <AlertDescription>{text}</AlertDescription>
      </Alert>
    );
  }

  if (!decision) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDecision("ACCEPT")}>
          <Check /> Accept estimate
        </Button>
        <Button variant="outline" onClick={() => setDecision("DECLINE")}>
          <X /> Decline
        </Button>
      </div>
    );
  }

  const accepting = decision === "ACCEPT";
  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      <input type="hidden" name="decision" value={decision} />
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="responder-name">Your name</Label>
        <Input id="responder-name" name="name" required maxLength={200} autoComplete="name" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="responder-note">Note (optional)</Label>
        <Textarea
          id="responder-note"
          name="note"
          rows={3}
          maxLength={2000}
          placeholder={accepting ? "Anything we should know before we start?" : "Anything you'd like us to know?"}
        />
      </div>
      {accepting ? (
        <p className="text-sm text-muted-foreground">
          By accepting, you agree to the scope and pricing above. Your name, the time, and your IP
          address are recorded with your acceptance.
        </p>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton pendingText={accepting ? "Accepting..." : "Declining..."}>
          {accepting ? "Accept estimate" : "Decline estimate"}
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setDecision(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
