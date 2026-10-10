"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { saveReminderSettingsAction } from "@/actions/invoices";
import type { ActionState } from "@/actions/auth";

export function RemindersCard({
  days,
  readOnly,
  emailConfigured,
}: {
  days: number[];
  readOnly: boolean;
  emailConfigured: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    saveReminderSettingsAction,
    null
  );
  return (
    <Card id="reminders">
      <CardHeader>
        <CardTitle className="text-base">Overdue reminders</CardTitle>
        <p className="text-xs text-muted-foreground">
          Email clients a reminder with the invoice link when a sent invoice is this many days
          overdue — checked once a day, each reminder sent once. To skip a client, untick
          &ldquo;Email overdue reminders&rdquo; on its edit page.
          {!emailConfigured ? " Needs email set up under Settings → Integrations." : ""}
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="reminderDays">Days overdue</Label>
            <Input
              id="reminderDays"
              name="reminderDays"
              defaultValue={days.join(", ")}
              placeholder="e.g. 3, 7, 14 — empty for off"
              className="w-64"
              disabled={readOnly}
            />
          </div>
          {!readOnly ? (
            <SubmitButton size="sm" pendingText="Saving...">
              Save
            </SubmitButton>
          ) : null}
          {state?.fieldErrors?.reminderDays ? (
            <p className="w-full text-sm text-destructive">{state.fieldErrors.reminderDays[0]}</p>
          ) : state?.saved ? (
            <p className="text-sm text-muted-foreground">
              {days.length ? `Reminders at ${days.join(", ")} days.` : "Reminders off."}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
