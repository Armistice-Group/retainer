"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLinkAction } from "@/actions/clients";
import type { ActionState } from "@/actions/auth";

export function AddLinkDialog({
  clientId,
  projectId,
}: {
  clientId?: string;
  projectId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createLinkAction,
    null
  );
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
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> Add link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a link</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
          {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-label">Label</Label>
            <Input id="link-label" name="label" placeholder="e.g. Shared Drive" required />
            {state?.fieldErrors?.label ? (
              <p className="text-sm text-destructive">{state.fieldErrors.label[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-url">URL</Label>
            <Input id="link-url" name="url" placeholder="https://" required />
            {state?.fieldErrors?.url ? (
              <p className="text-sm text-destructive">{state.fieldErrors.url[0]}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="link-type">Type</Label>
            <Select name="type" defaultValue="OTHER">
              <SelectTrigger id="link-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOGIN">Login</SelectItem>
                <SelectItem value="GDRIVE">Google Drive</SelectItem>
                <SelectItem value="DOC">Document</SelectItem>
                <SelectItem value="REPO">Repository</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <SubmitButton pendingText="Adding...">Add link</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
