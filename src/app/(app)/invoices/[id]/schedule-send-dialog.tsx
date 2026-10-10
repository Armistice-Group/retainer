"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { scheduleInvoiceSendAction } from "@/actions/invoice-schedule";
import type { ActionState } from "@/actions/auth";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Tomorrow, or the current schedule, as local date and time inputs. */
function initialValues(current: string | null) {
  const d = current ? new Date(current) : new Date(Date.now() + 86_400_000);
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: current ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "09:00",
  };
}

export function ScheduleSendDialog({
  invoiceId,
  invoiceNumber,
  recipients,
  emailConfigured,
  scheduledSendAt,
}: {
  invoiceId: string;
  invoiceNumber: string;
  recipients: string[];
  emailConfigured: boolean;
  /** ISO, when it's already scheduled. */
  scheduledSendAt: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => initialValues(scheduledSendAt));
  const [state, formAction] = useActionState<ActionState, FormData>(async (prev, formData) => {
    // The inputs are in the viewer's time zone; send the exact moment.
    const local = new Date(`${values.date}T${values.time || "09:00"}`);
    formData.set("sendAt", Number.isNaN(local.getTime()) ? "" : local.toISOString());
    const result = await scheduleInvoiceSendAction(invoiceId, prev, formData);
    if (result?.saved) {
      setOpen(false);
      toast.success(`Invoice ${invoiceNumber} scheduled.`);
    }
    return result;
  }, null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues(initialValues(scheduledSendAt));
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarClock /> {scheduledSendAt ? "Reschedule" : "Schedule send"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule invoice {invoiceNumber}</DialogTitle>
          <DialogDescription>
            It&apos;s emailed to the client at that time (within the hour after) and marked as sent.
            Its issue date becomes the day it goes out, and the due date moves with it so the
            payment terms stay the same.
          </DialogDescription>
        </DialogHeader>
        {!emailConfigured ? (
          <Alert>
            <AlertDescription>
              Email isn&apos;t set up on this instance (Settings → Integrations), so a scheduled
              invoice can&apos;t be sent. Set up email first.
            </AlertDescription>
          </Alert>
        ) : recipients.length === 0 ? (
          <Alert>
            <AlertDescription>
              This client has no invoice contact, billing email or email address. Add one on the
              client first.
            </AlertDescription>
          </Alert>
        ) : (
          <form action={formAction} className="flex flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}
            <p className="text-sm text-muted-foreground">To: {recipients.join(", ")}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="schedule-date">Date</Label>
                <Input
                  id="schedule-date"
                  type="date"
                  value={values.date}
                  onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="schedule-time">Time (your time zone)</Label>
                <Input
                  id="schedule-time"
                  type="time"
                  value={values.time}
                  onChange={(e) => setValues((v) => ({ ...v, time: e.target.value }))}
                  required
                />
              </div>
            </div>
            <SubmitButton pendingText="Scheduling...">
              {scheduledSendAt ? "Reschedule" : "Schedule"}
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
