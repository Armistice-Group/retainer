"use client";

import { useActionState, useState } from "react";
import { Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { setDocumentAccessAction } from "@/actions/client-documents";
import { DocumentAccessFields, type DocumentMember } from "./document-access-fields";
import type { ActionState } from "@/actions/auth";

export function DocumentAccessDialog({
  clientId,
  document,
  members,
  viewerId,
}: {
  clientId: string;
  document: { id: string; label: string | null; fileName: string; access: string; allowedUserIds: string[] };
  members: DocumentMember[];
  viewerId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    const result = await setDocumentAccessAction(document.id, clientId, prev, formData);
    if (result?.saved) setOpen(false);
    return result;
  }, null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Who can see it">
          <Shield className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who can see “{document.label || document.fileName}”</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <DocumentAccessFields
            members={members}
            viewerId={viewerId}
            defaultAccess={document.access}
            defaultAllowed={document.allowedUserIds}
            idPrefix={`doc-${document.id}`}
          />
          <SubmitButton pendingText="Saving...">Save</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
