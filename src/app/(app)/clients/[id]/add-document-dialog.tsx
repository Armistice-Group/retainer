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
import { uploadClientDocumentAction } from "@/actions/client-documents";
import type { ActionState } from "@/actions/auth";

export function AddDocumentDialog({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const action = uploadClientDocumentAction.bind(null, clientId);
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
        <Button variant="outline" size="sm">
          <Plus className="size-3.5" /> Add document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="document-type">Type</Label>
            <Select name="type" defaultValue="OTHER">
              <SelectTrigger id="document-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="W9">W-9</SelectItem>
                <SelectItem value="FORM_1099">1099</SelectItem>
                <SelectItem value="CONTRACT">Contract</SelectItem>
                <SelectItem value="OTHER">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="document-label">Label (optional)</Label>
            <Input id="document-label" name="label" placeholder="e.g. 2025 W-9" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="document-file">File</Label>
            <input
              id="document-file"
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              required
              className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
            />
            <p className="text-xs text-muted-foreground">PNG, JPEG, WebP, or PDF, up to 5MB.</p>
          </div>
          <SubmitButton pendingText="Uploading...">Add document</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
