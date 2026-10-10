"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import {
  createCalendarSubscriptionAction,
  revokeCalendarSubscriptionAction,
} from "@/actions/calendar-subscription";
import { formatDate } from "@/lib/format";

export function CalendarSubscriptionCard({
  subscription,
  orgName,
}: {
  subscription: { createdAt: string; lastFetchedAt: string | null } | null;
  orgName: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function create() {
    if (subscription && !confirm("Make a new address? The current one stops working in every calendar app using it.")) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        setUrl((await createCalendarSubscriptionAction()).url);
      } catch {
        setError("Couldn't create the address. Try again.");
      }
    });
  }

  function revoke() {
    if (!confirm("Turn off your calendar address? Calendar apps using it stop updating.")) return;
    startTransition(async () => {
      await revokeCalendarSubscriptionAction();
      setUrl(null);
    });
  }

  return (
    <Card id="calendar-subscription">
      <CardHeader>
        <CardTitle className="text-base">Subscribe in your calendar app</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground">
          A private address for Google Calendar, Apple Calendar or Outlook with your deadlines in{" "}
          {orgName}: your tasks&apos; due dates, milestones and deliverables, project start and end
          dates and, for owners and admins, invoice due dates, scheduled sends, recurring invoices,
          billing cycles and estimate expiries. Only what you can see in the app; meetings
          aren&apos;t included (they&apos;re in your calendar already). Anyone with the address can
          read it, so keep it to yourself.
        </p>

        {url ? (
          <Alert>
            <AlertDescription className="flex flex-col gap-2">
              <span>Copy this address now — you won&apos;t be able to see it again.</span>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{url}</code>
                <CopyButton value={url} label="Copy calendar address" />
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {subscription ? (
          <p className="text-xs text-muted-foreground">
            Address created {formatDate(subscription.createdAt)}
            {subscription.lastFetchedAt
              ? ` · last read by a calendar app ${formatDate(subscription.lastFetchedAt)}`
              : " · not read by a calendar app yet"}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={create} disabled={isPending}>
            {subscription ? "Make a new address" : "Create calendar address"}
          </Button>
          {subscription ? (
            <Button size="sm" variant="outline" onClick={revoke} disabled={isPending}>
              Turn off
            </Button>
          ) : null}
        </div>

        <details className="text-muted-foreground">
          <summary className="cursor-pointer select-none">How to set this up</summary>
          <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5">
            <li>Click <strong>Create calendar address</strong> and copy it.</li>
            <li>
              Google Calendar: <strong>Other calendars → + → From URL</strong>, paste it, and click{" "}
              <strong>Add calendar</strong>.
            </li>
            <li>
              Apple Calendar: <strong>File → New Calendar Subscription</strong>, paste it, and pick how
              often to refresh.
            </li>
            <li>
              Outlook: <strong>Add calendar → Subscribe from web</strong>, paste it, and import.
            </li>
            <li>
              Calendar apps refresh on their own schedule (Google can take several hours), so new
              dates can take a while to appear there.
            </li>
          </ol>
        </details>
      </CardContent>
    </Card>
  );
}
