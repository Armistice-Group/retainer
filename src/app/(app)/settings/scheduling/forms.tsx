"use client";

import { useActionState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  connectCalcomAction,
  connectCalendlyAction,
  refreshEventTypesAction,
  rotateCalcomSecretAction,
  setCompanyQuestionAction,
  setOrgBookingUrlAction,
  syncSchedulingNowAction,
  updateEventTypeAction,
} from "@/actions/scheduling";
import type { ActionState } from "@/actions/auth";

const selectClass = "h-8 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs";

function ErrorAlert({ state }: { state: ActionState }) {
  return state?.error ? (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  ) : null;
}

export function CalcomForm({ baseUrl, connected }: { baseUrl: string | null; connected: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectCalcomAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <ErrorAlert state={state} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="calcom-url">Cal.com API address</Label>
        <Input
          id="calcom-url"
          name="baseUrl"
          defaultValue={baseUrl ?? "https://api.cal.com"}
          placeholder="https://api.cal.com"
        />
        <p className="text-xs text-muted-foreground">
          Leave as is for Cal.com&apos;s cloud. If you host Cal.com yourself, use the address of its API v2 service.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="calcom-key">API key</Label>
        <Input
          id="calcom-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={connected ? "Saved — paste a new key to replace it" : "cal_live_..."}
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="createWebhook" defaultChecked />
        Create the webhook in Cal.com for me
      </label>
      <div>
        <SubmitButton size="sm" pendingText="Checking...">
          {connected ? "Update" : "Connect Cal.com"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function CalendlyForm({ connected }: { connected: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectCalendlyAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <ErrorAlert state={state} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="calendly-token">Personal access token</Label>
        <Input
          id="calendly-token"
          name="token"
          type="password"
          autoComplete="off"
          placeholder={connected ? "Saved — paste a new token to replace it" : "eyJ..."}
          required
        />
      </div>
      <div>
        <SubmitButton size="sm" pendingText="Checking...">
          {connected ? "Reconnect" : "Connect Calendly"}
        </SubmitButton>
      </div>
    </form>
  );
}

/** "Sync now" / "Refresh event types" / "New secret" buttons. */
export function ActionButton({
  kind,
  provider,
  children,
}: {
  kind: "sync" | "refresh" | "rotate";
  provider: string;
  children: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (
            kind === "rotate" &&
            !window.confirm("Make a new secret? The old one stops working until you paste the new one into Cal.com.")
          ) {
            return;
          }
          const r =
            kind === "sync"
              ? await syncSchedulingNowAction(provider)
              : kind === "refresh"
                ? await refreshEventTypesAction(provider)
                : await rotateCalcomSecretAction();
          if (r?.error) toast.error(r.error);
          else toast.success(kind === "rotate" ? "New secret made." : "Done.");
        })
      }
    >
      {kind === "rotate" ? null : <RefreshCw className="size-3.5" />}
      {children}
    </Button>
  );
}

export function CompanyQuestionForm({ provider, value }: { provider: string; value: string | null }) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    setCompanyQuestionAction.bind(null, provider),
    null
  );
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Label htmlFor={`company-q-${provider}`}>Booking question with the company name</Label>
      <div className="flex gap-2">
        <Input
          id={`company-q-${provider}`}
          name="companyQuestion"
          defaultValue={value ?? ""}
          placeholder="Automatic (a question that mentions company or organization)"
        />
        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
          Save
        </SubmitButton>
      </div>
      <p className="text-xs text-muted-foreground">
        The question&apos;s label exactly as it appears on your booking page (or its Cal.com identifier). Without an
        answer, the draft is named after the email&apos;s company domain, or the person&apos;s name for Gmail and
        similar addresses.
      </p>
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state?.saved ? <p className="text-xs text-muted-foreground">Saved.</p> : null}
    </form>
  );
}

export function EventTypeRow({
  eventType,
  projects,
}: {
  eventType: {
    id: string;
    name: string;
    bookingUrl: string | null;
    purpose: string;
    projectId: string | null;
    billable: boolean;
  };
  projects: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateEventTypeAction.bind(null, eventType.id),
    null
  );
  return (
    <li className="py-3">
      <form action={formAction} className="flex flex-col gap-2">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{eventType.name}</p>
          {eventType.bookingUrl ? (
            <a
              href={eventType.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-xs text-muted-foreground hover:underline"
            >
              {eventType.bookingUrl}
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            name="purpose"
            defaultValue={eventType.purpose}
            className={`${selectClass} sm:w-44`}
            aria-label={`What ${eventType.name} is for`}
          >
            <option value="INTAKE">Intake (new clients)</option>
            <option value="CLIENTS">Existing clients</option>
            <option value="IGNORE">Ignore</option>
          </select>
          <select
            name="projectId"
            defaultValue={eventType.projectId ?? ""}
            className={`${selectClass} sm:w-56`}
            aria-label={`Default project for ${eventType.name}`}
          >
            <option value="">No default project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox name="billable" defaultChecked={eventType.billable} />
            Billable
          </label>
          <SubmitButton size="sm" variant="outline" pendingText="Saving...">
            Save
          </SubmitButton>
        </div>
      </form>
      {state?.error ? <p className="mt-1 text-xs text-destructive">{state.error}</p> : null}
      {state?.saved ? <p className="mt-1 text-xs text-muted-foreground">Saved.</p> : null}
    </li>
  );
}

export function OrgBookingUrlForm({ value }: { value: string | null }) {
  const [state, formAction] = useActionState<ActionState, FormData>(setOrgBookingUrlAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <Label htmlFor="org-booking-url">Default booking link</Label>
      <div className="flex gap-2">
        <Input
          id="org-booking-url"
          name="bookingUrl"
          defaultValue={value ?? ""}
          placeholder="https://cal.com/you/30min"
        />
        <SubmitButton size="sm" variant="outline" pendingText="Saving...">
          Save
        </SubmitButton>
      </div>
      {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state?.saved ? <p className="text-xs text-muted-foreground">Saved.</p> : null}
    </form>
  );
}
