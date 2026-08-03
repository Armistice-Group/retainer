"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { completeMilestoneAction } from "@/actions/milestones";
import type { ActionState } from "@/actions/auth";

export function CompleteMilestoneDialog({
  projectId,
  milestoneId,
  milestoneName,
}: {
  projectId: string;
  milestoneId: string;
  milestoneName: string;
}) {
  const [open, setOpen] = useState(false);
  const action = completeMilestoneAction.bind(null, projectId);
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
        <Button size="sm">
          <CheckCircle2 className="size-3.5" /> Mark complete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete &quot;{milestoneName}&quot;</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="milestoneId" value={milestoneId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="completion-note">Evidence of completion</Label>
            <Textarea
              id="completion-note"
              name="completionNote"
              rows={4}
              placeholder="What was delivered, and how was it verified? e.g. Signed off by client on call 3/14, deployed to production."
              required
            />
            {state?.fieldErrors?.completionNote ? (
              <p className="text-sm text-destructive">{state.fieldErrors.completionNote[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="completion-url">Link (optional)</Label>
            <Input
              id="completion-url"
              name="completionUrl"
              placeholder="https://... deployed URL, PR, doc, etc."
            />
            {state?.fieldErrors?.completionUrl ? (
              <p className="text-sm text-destructive">{state.fieldErrors.completionUrl[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="completion-file">Attach a file (optional)</Label>
            <input
              id="completion-file"
              type="file"
              name="evidenceFile"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
            />
            <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, or PDF, up to 5MB.</p>
          </div>
          <SubmitButton pendingText="Marking complete...">Mark complete</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
