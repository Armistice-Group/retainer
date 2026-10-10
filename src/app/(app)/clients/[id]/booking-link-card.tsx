"use client";

import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/forms/submit-button";
import { setClientBookingUrlAction } from "@/actions/scheduling";
import type { ActionState } from "@/actions/auth";

/** The "Book a meeting" link on this client's share page. */
export function BookingLinkCard({
  clientId,
  value,
  orgDefault,
}: {
  clientId: string;
  value: string | null;
  orgDefault: string | null;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setClientBookingUrlAction.bind(null, clientId),
    null
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Booking link</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <Input
              name="bookingUrl"
              aria-label="Booking link"
              defaultValue={value ?? ""}
              placeholder={orgDefault ?? "https://cal.com/you/check-in"}
            />
            <SubmitButton size="sm" variant="outline" pendingText="Saving...">
              Save
            </SubmitButton>
          </div>
          <p className="text-xs text-muted-foreground">
            Shown as <strong>Book a meeting</strong> on this client&apos;s share page.{" "}
            {orgDefault
              ? "Leave empty to use your default link (Settings → Scheduling)."
              : "Set a default for every client under Settings → Scheduling."}
          </p>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          {state?.saved ? <p className="text-xs text-muted-foreground">Saved.</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
