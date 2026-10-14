"use client";

import { useActionState, useState } from "react";
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
import { CopyButton } from "@/components/copy-button";
import { createInviteAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

export function InviteDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  // Opened straight away from "Invite people" links (?invite=1).
  const [open, setOpen] = useState(defaultOpen);
  // Remounting the form on every open resets its action state, so a
  // previous invite's link doesn't linger the next time the dialog opens.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" /> Invite member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to your organization</DialogTitle>
        </DialogHeader>
        <InviteForm key={formKey} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({ onDone }: { onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createInviteAction, null);

  if (state?.inviteUrl) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {state.emailSent
            ? "We emailed them an invite. You can also share this link directly — it expires in 14 days."
            : "Share this link with them — it expires in 14 days."}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <Input
            readOnly
            value={state.inviteUrl}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <CopyButton value={state.inviteUrl} label="Copy" />
        </div>
        <Button type="button" className="self-start" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required />
        {state?.fieldErrors?.email ? (
          <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <Select name="role" defaultValue="MEMBER">
          <SelectTrigger id="invite-role" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="MEMBER">Member</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Members track time and work on clients, projects and tasks. Admins also manage settings,
          people, reports, approvals and emailing invoices. You can change this later.
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;ll get a link to share; it&apos;s also emailed if email is set up. It expires in 14
        days.
      </p>
      <SubmitButton pendingText="Creating...">Create invite</SubmitButton>
    </form>
  );
}
