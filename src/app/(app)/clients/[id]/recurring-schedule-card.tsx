import { Repeat, Pause, Play, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { CreateRecurringScheduleDialog } from "./create-recurring-schedule-dialog";
import {
  pauseRecurringScheduleAction,
  resumeRecurringScheduleAction,
  deleteRecurringScheduleAction,
} from "@/actions/recurring-invoices";
import { formatCurrency, formatDate } from "@/lib/format";
import { billingIntervalLabel, type BillingInterval } from "@/lib/billing-interval";

export type RecurringScheduleItem = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  active: boolean;
  autoSend: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
};

export function RecurringScheduleCard({
  clientId,
  schedules,
}: {
  clientId: string;
  schedules: RecurringScheduleItem[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Retainers</CardTitle>
        <CreateRecurringScheduleDialog clientId={clientId} />
      </CardHeader>
      <CardContent>
        {schedules.length === 0 ? (
          <EmptyState
            icon={Repeat}
            title="No retainer"
            description="Bill a fixed amount on a schedule, independent of logged time."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {schedules.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{s.description}</p>
                    {!s.active ? (
                      <Badge variant="outline" className="font-normal">
                        Paused
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(s.amount, s.currency)} · {billingIntervalLabel(s.interval)}
                    {" · "}
                    {s.active ? `Next ${formatDate(s.nextRunAt)}` : "Not running"}
                    {s.lastRunAt ? ` · Last ${formatDate(s.lastRunAt)}` : ""}
                    {s.autoSend ? " · Auto-sends" : " · Drafts for review"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.active ? (
                    <form action={pauseRecurringScheduleAction.bind(null, s.id, clientId)}>
                      <Button variant="ghost" size="icon" className="size-7" type="submit">
                        <Pause className="size-3.5" />
                      </Button>
                    </form>
                  ) : (
                    <form action={resumeRecurringScheduleAction.bind(null, s.id, clientId)}>
                      <Button variant="ghost" size="icon" className="size-7" type="submit">
                        <Play className="size-3.5" />
                      </Button>
                    </form>
                  )}
                  <form action={deleteRecurringScheduleAction.bind(null, s.id, clientId)}>
                    <ConfirmSubmitButton
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      confirmMessage="Delete this recurring schedule? This won't affect invoices already generated from it."
                    >
                      <Trash2 className="size-3.5" />
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
