"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { setMemberBillRateAction, setMemberCostRateAction } from "@/actions/org";

const KINDS = {
  cost: {
    label: "Cost",
    action: setMemberCostRateAction,
    aria: (name: string) => `${name}'s hourly cost`,
    title:
      "What an hour of their time costs you (salary or contractor rate). Used for profit on Reports; only owners and admins see it.",
  },
  bill: {
    label: "Rate",
    action: setMemberBillRateAction,
    aria: (name: string) => `${name}'s default bill rate`,
    title:
      "What they bill per hour by default — prefilled when they're added to a project. Blank uses the organization's default rate. Doesn't change projects they're already on.",
  },
} as const;

/** Inline hourly cost or default bill rate for a member; saves on blur or Enter. */
export function CostRateField({
  membershipId,
  value,
  name,
  kind = "cost",
  placeholder = "—",
  currency,
}: {
  membershipId: string;
  value: string;
  name: string;
  kind?: keyof typeof KINDS;
  placeholder?: string;
  currency?: string;
}) {
  const config = KINDS[kind];
  const [saved, setSaved] = useState(value);
  const [pending, startTransition] = useTransition();

  function save(next: string) {
    if (next.trim() === saved.trim()) return;
    startTransition(async () => {
      try {
        await config.action(membershipId, next);
        setSaved(next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>{config.label}</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        defaultValue={value}
        placeholder={placeholder}
        disabled={pending}
        aria-label={config.aria(name)}
        title={config.title}
        className="h-7 w-20 text-xs"
        onBlur={(e) => save(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      <span>{currency ? `${currency}/h` : "/h"}</span>
    </div>
  );
}
