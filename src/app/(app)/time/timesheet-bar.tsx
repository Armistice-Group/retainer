"use client";

import { useState, useTransition } from "react";
import { CalendarCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { submitTimesheetAction, recallTimesheetAction } from "@/actions/timesheets";

export type TimesheetBarData = {
  week: string;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  note: string | null;
  reviewerName: string | null;
  hours: number;
};

const LABELS: Record<TimesheetBarData["status"], string> = {
  DRAFT: "Not submitted",
  SUBMITTED: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Changes requested",
};

/** The viewer's own week: its approval status and the submit/recall button. */
export function TimesheetBar({ sheet }: { sheet: TimesheetBarData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: (week: string) => Promise<{ error?: string } | null>) {
    setError(null);
    startTransition(async () => {
      const result = await action(sheet.week);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <CalendarCheck className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium">Timesheet</span>
        <Badge
          variant={sheet.status === "APPROVED" ? "default" : "outline"}
          className={sheet.status === "REJECTED" ? "border-destructive text-destructive" : undefined}
        >
          {LABELS[sheet.status]}
        </Badge>
        {sheet.status === "REJECTED" && sheet.note ? (
          <span className="min-w-0 text-muted-foreground">
            {sheet.reviewerName ? `${sheet.reviewerName}: ` : ""}
            {sheet.note}
          </span>
        ) : sheet.status === "DRAFT" || sheet.status === "REJECTED" ? (
          <span className="text-muted-foreground">
            Submit the week when it&apos;s complete. Time is invoiced once it&apos;s approved.
          </span>
        ) : sheet.status === "SUBMITTED" ? (
          <span className="text-muted-foreground">
            This week is locked while it&apos;s reviewed. Recall it to make changes.
          </span>
        ) : sheet.status === "APPROVED" ? (
          <span className="text-muted-foreground">
            This week is locked and its billable time can be invoiced.
          </span>
        ) : null}
      </div>
      {error ? <p className="text-destructive">{error}</p> : null}
      {sheet.status === "DRAFT" || sheet.status === "REJECTED" ? (
        <Button
          size="sm"
          disabled={pending || sheet.hours === 0}
          onClick={() => run(submitTimesheetAction)}
        >
          {sheet.status === "REJECTED" ? "Resubmit week" : "Submit week"}
        </Button>
      ) : sheet.status === "SUBMITTED" ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => run(recallTimesheetAction)}>
          <Undo2 /> Recall
        </Button>
      ) : null}
    </div>
  );
}
