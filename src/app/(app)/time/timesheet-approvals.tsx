"use client";

import { useActionState, useState } from "react";
import { Check, CalendarCheck, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/empty-state";
import { reviewTimesheetAction } from "@/actions/timesheets";
import { formatDate } from "@/lib/format";
import type { ActionState } from "@/actions/auth";

export type PendingTimesheet = {
  id: string;
  userName: string;
  weekLabel: string;
  hours: number;
  billableHours: number;
  entries: {
    id: string;
    date: string;
    hours: number;
    billable: boolean;
    description: string | null;
    project: string;
  }[];
};

export function TimesheetApprovals({ sheets }: { sheets: PendingTimesheet[] }) {
  if (sheets.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Nothing waiting for approval"
        description="Submitted timesheets show up here."
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {sheets.map((sheet) => (
        <ApprovalCard key={sheet.id} sheet={sheet} />
      ))}
    </div>
  );
}

function ApprovalCard({ sheet }: { sheet: PendingTimesheet }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    reviewTimesheetAction.bind(null, sheet.id),
    null
  );
  const [sendingBack, setSendingBack] = useState(false);

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <span className="font-medium">{sheet.userName}</span>
        <span className="text-sm text-muted-foreground">Week of {sheet.weekLabel}</span>
        <Badge variant="outline" className="tabular-figures ml-auto font-normal">
          {sheet.hours.toFixed(2)}h · {sheet.billableHours.toFixed(2)}h billable
        </Badge>
      </div>
      <ul className="divide-y divide-border text-sm">
        {sheet.entries.map((e) => (
          <li key={e.id} className="flex items-start gap-3 px-4 py-2">
            <span className="w-24 shrink-0 text-muted-foreground">{formatDate(e.date)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate">{e.project}</p>
              {e.description ? (
                <p className="truncate text-muted-foreground">{e.description}</p>
              ) : null}
            </div>
            {!e.billable ? (
              <Badge variant="outline" className="font-normal">
                Non-billable
              </Badge>
            ) : null}
            <span className="tabular-figures shrink-0">{e.hours.toFixed(2)}h</span>
          </li>
        ))}
      </ul>
      <form action={formAction} className="flex flex-col gap-2 border-t border-border px-4 py-3">
        {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
        {sendingBack ? (
          <Textarea
            name="note"
            rows={2}
            placeholder="What needs changing? They'll see this."
            required
            autoFocus
          />
        ) : null}
        <div className="flex justify-end gap-2">
          {sendingBack ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSendingBack(false)}>
                Cancel
              </Button>
              <Button type="submit" name="decision" value="reject" size="sm" variant="outline" disabled={pending}>
                <Undo2 /> Send back
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={() => setSendingBack(true)}>
                Request changes
              </Button>
              <Button type="submit" name="decision" value="approve" size="sm" disabled={pending}>
                <Check /> Approve
              </Button>
            </>
          )}
        </div>
      </form>
    </Card>
  );
}
