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
import { addProjectMemberAction } from "@/actions/projects";
import type { ActionState } from "@/actions/auth";

export function AddMemberDialog({
  projectId,
  members,
  currency,
}: {
  projectId: string;
  members: { id: string; name: string; email: string }[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addProjectMemberAction,
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
          <Plus className="size-3.5" /> Add team member
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to project</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-user">Team member</Label>
            <Select name="userId">
              <SelectTrigger id="member-user" className="w-full">
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {state?.fieldErrors?.userId ? (
              <p className="text-sm text-destructive">{state.fieldErrors.userId[0]}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-rate">Hourly rate</Label>
              <Input
                id="member-rate"
                name="billRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
                required
              />
              {state?.fieldErrors?.billRate ? (
                <p className="text-sm text-destructive">{state.fieldErrors.billRate[0]}</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-currency">Currency</Label>
              <Input id="member-currency" name="currency" defaultValue={currency} required />
            </div>
          </div>
          <SubmitButton pendingText="Adding...">Add to project</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
