"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  orgDefaultRate,
}: {
  projectId: string;
  members: {
    id: string;
    name: string;
    email: string;
    isContractor: boolean;
    defaultRate: number;
    hasOwnRate: boolean;
  }[];
  currency: string;
  orgDefaultRate: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [rate, setRate] = useState(String(orgDefaultRate ?? 0));
  const selected = members.find((m) => m.id === selectedUserId);
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    addProjectMemberAction,
    null
  );
  const wasPending = useRef(false);
  const selectedIsContractor = selected?.isContractor ?? false;
  const rateSource = selected?.hasOwnRate
    ? "Their default rate."
    : orgDefaultRate != null
      ? "The organization's default rate."
      : null;

  function selectPerson(userId: string) {
    setSelectedUserId(userId);
    const person = members.find((m) => m.id === userId);
    if (person) setRate(String(person.defaultRate));
  }

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error && !state?.fieldErrors) {
      setOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending, state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The form remounts on open; start it fresh rather than with the
        // last person's rate.
        if (next) {
          setSelectedUserId(undefined);
          setRate(String(orgDefaultRate ?? 0));
        }
        setOpen(next);
      }}
    >
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
            <Select name="userId" onValueChange={selectPerson}>
              <SelectTrigger id="member-user" className="w-full">
                <SelectValue placeholder="Select a person" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} · {m.email}
                    {m.isContractor ? " (Contractor)" : ""}
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
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                required
              />
              {state?.fieldErrors?.billRate ? (
                <p className="text-sm text-destructive">{state.fieldErrors.billRate[0]}</p>
              ) : rateSource ? (
                <p className="text-xs text-muted-foreground">{rateSource}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No default set —{" "}
                  <Link href="/settings/members" className="text-brand hover:underline">
                    set one
                  </Link>{" "}
                  to prefill this.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="member-currency">Currency</Label>
              <Input id="member-currency" name="currency" defaultValue={currency} required />
            </div>
          </div>
          {selectedIsContractor ? (
            <div className="flex items-start gap-2">
              <Checkbox id="member-requires-approval" name="requiresApproval" className="mt-0.5" />
              <Label htmlFor="member-requires-approval" className="text-sm font-normal">
                Email the client to approve this contractor before they start
              </Label>
            </div>
          ) : null}
          <SubmitButton pendingText="Adding...">Add to project</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
