"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { connectDocumensoAction, connectIroncladAction } from "@/actions/agreements";
import type { ActionState } from "@/actions/auth";

function ErrorAlert({ state }: { state: ActionState }) {
  return state?.error ? (
    <Alert variant="destructive">
      <AlertDescription>{state.error}</AlertDescription>
    </Alert>
  ) : null;
}

export function DocumensoForm({ baseUrl, connected }: { baseUrl: string | null; connected: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectDocumensoAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <ErrorAlert state={state} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="documenso-url">Documenso URL</Label>
        <Input
          id="documenso-url"
          name="baseUrl"
          defaultValue={baseUrl ?? "https://app.documenso.com"}
          placeholder="https://app.documenso.com"
        />
        <p className="text-xs text-muted-foreground">
          Leave as is for Documenso&apos;s cloud. If you host Documenso yourself, use the address
          you open it at.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="documenso-key">API key</Label>
        <Input
          id="documenso-key"
          name="apiKey"
          type="password"
          autoComplete="off"
          placeholder={connected ? "Saved — paste a new key to replace it" : "api_..."}
          required
        />
      </div>
      <div>
        <SubmitButton size="sm" pendingText="Checking...">
          {connected ? "Update" : "Connect Documenso"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function IroncladForm({
  region,
  clientId,
  actAsEmail,
  connected,
}: {
  region: string | null;
  clientId: string | null;
  actAsEmail: string | null;
  connected: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(connectIroncladAction, null);
  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <ErrorAlert state={state} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ironclad-region">Ironclad site</Label>
        <select
          id="ironclad-region"
          name="region"
          defaultValue={region ?? "na1"}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="na1">ironcladapp.com (US)</option>
          <option value="eu1">eu1.ironcladapp.com (EU)</option>
          <option value="demo">demo.ironcladapp.com (demo)</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ironclad-client-id">Client ID</Label>
        <Input id="ironclad-client-id" name="clientId" defaultValue={clientId ?? ""} autoComplete="off" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ironclad-secret">Client secret</Label>
        <Input
          id="ironclad-secret"
          name="clientSecret"
          type="password"
          autoComplete="off"
          placeholder={connected ? "Paste it again to save changes" : undefined}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ironclad-user">Read as (Ironclad user email)</Label>
        <Input
          id="ironclad-user"
          name="actAsEmail"
          type="email"
          defaultValue={actAsEmail ?? ""}
          placeholder="you@yourcompany.com"
          required
        />
        <p className="text-xs text-muted-foreground">
          Ironclad answers API calls as this person, so you see the records they can see.
        </p>
      </div>
      <div>
        <SubmitButton size="sm" pendingText="Checking...">
          {connected ? "Update" : "Connect Ironclad"}
        </SubmitButton>
      </div>
    </form>
  );
}
