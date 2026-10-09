"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { saveAlertSettingsAction } from "@/actions/alerts";
import type { ActionState } from "@/actions/auth";

type EventRow = {
  event: string;
  label: string;
  hint: string | null;
  email: boolean;
  slack: boolean;
};

export function AlertSettingsForm({
  events,
  alertEmails,
  slackConfigured,
  emailConfigured,
}: {
  events: EventRow[];
  alertEmails: string[];
  slackConfigured: boolean;
  emailConfigured: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveAlertSettingsAction, null);

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alerts</CardTitle>
          <p className="text-xs text-muted-foreground">
            Owners and admins always get these in Consultainer. Choose which also go to Slack
            and email.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!slackConfigured || !emailConfigured ? (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              {!slackConfigured ? (
                <>
                  Slack isn&apos;t connected — add a webhook URL in{" "}
                  <Link href="/settings#slackWebhookUrl" className="text-brand hover:underline">
                    General
                  </Link>
                  .{" "}
                </>
              ) : null}
              {!emailConfigured ? (
                <>
                  Email isn&apos;t set up on this instance —{" "}
                  <Link href="/settings/integrations" className="text-brand hover:underline">
                    Integrations
                  </Link>
                  .
                </>
              ) : null}
            </p>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">When</th>
                  <th className="w-16 pb-2 text-center font-medium">Slack</th>
                  <th className="w-16 pb-2 text-center font-medium">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((e) => (
                  <tr key={e.event}>
                    <td className="py-2.5 pr-3">
                      <p>{e.label}</p>
                      {e.hint ? <p className="text-xs text-muted-foreground">{e.hint}</p> : null}
                    </td>
                    <td className="text-center">
                      <Checkbox
                        name={`${e.event}.slack`}
                        defaultChecked={e.slack}
                        aria-label={`${e.label}: Slack`}
                      />
                    </td>
                    <td className="text-center">
                      <Checkbox
                        name={`${e.event}.email`}
                        defaultChecked={e.email}
                        aria-label={`${e.label}: email`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="alertEmails">Send alert emails to</Label>
            <Textarea
              id="alertEmails"
              name="alertEmails"
              rows={2}
              defaultValue={alertEmails.join(", ")}
              placeholder="Leave empty to email the organization's owners"
            />
            {state?.fieldErrors?.alertEmails ? (
              <p className="text-sm text-destructive">{state.fieldErrors.alertEmails[0]}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <SubmitButton size="sm" pendingText="Saving...">
              Save alerts
            </SubmitButton>
            {state?.saved ? <span className="text-sm text-muted-foreground">Saved.</span> : null}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
