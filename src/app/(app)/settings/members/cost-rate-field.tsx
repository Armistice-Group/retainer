"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setMemberCostRateAction } from "@/actions/org";

/** Inline hourly cost for a member; saves on blur or Enter. */
export function CostRateField({
  membershipId,
  value,
  name,
}: {
  membershipId: string;
  value: string;
  name: string;
}) {
  const [saved, setSaved] = useState(value);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    if (next.trim() === saved.trim()) return;
    startTransition(async () => {
      try {
        await setMemberCostRateAction(membershipId, next);
        setSaved(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>Cost</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        defaultValue={value}
        placeholder="—"
        disabled={pending}
        aria-label={`${name}'s hourly cost`}
        title="What an hour of their time costs you (salary or contractor rate). Used for profit on Reports; only owners and admins see it."
        className="h-7 w-20 text-xs"
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <span>/h</span>
    </div>
  );
}
