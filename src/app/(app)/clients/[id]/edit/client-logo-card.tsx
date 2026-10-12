"use client";

import { useActionState, useState } from "react";
import { Globe, Trash2, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SubmitButton } from "@/components/forms/submit-button";
import { ClientAvatar } from "@/components/client-avatar";
import {
  fetchClientLogoAction,
  removeClientLogoAction,
  uploadClientLogoAction,
} from "@/actions/client-logos";
import type { ActionState } from "@/actions/auth";

export function ClientLogoCard({
  clientId,
  name,
  src,
  source,
  website,
}: {
  clientId: string;
  name: string;
  src: string | null;
  source: "upload" | "website" | null;
  website: string | null;
}) {
  const [uploadState, uploadAction] = useActionState<ActionState, FormData>(
    uploadClientLogoAction.bind(null, clientId),
    null
  );
  const [fetchState, fetchAction] = useActionState<ActionState, FormData>(
    () => fetchClientLogoAction(clientId),
    null
  );
  const [removeState, removeAction] = useActionState<ActionState, FormData>(
    () => removeClientLogoAction(clientId),
    null
  );
  const [fileChosen, setFileChosen] = useState(false);
  const error = uploadState?.error ?? fetchState?.error ?? removeState?.error;

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center gap-4">
          <ClientAvatar name={name} src={src} className="size-16 text-base" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <p>
              {source === "website"
                ? "The icon from the client's website."
                : source === "upload"
                  ? "Uploaded."
                  : "No logo yet. Their initials are shown instead."}
            </p>
            <p className="text-xs text-muted-foreground">
              Shown on the client list, the client&apos;s share link and their invoices. PNG, JPEG,
              WebP, GIF, SVG or ICO, up to 1MB.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={uploadAction} className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logo"
              aria-label="Logo image"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/x-icon,.ico"
              onChange={(e) => setFileChosen(!!e.target.files?.length)}
              className="max-w-64 text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
            />
            <SubmitButton size="sm" variant="outline" pendingText="Uploading..." disabled={!fileChosen}>
              <Upload className="size-3.5" /> Upload
            </SubmitButton>
          </form>
          {website ? (
            <form action={fetchAction}>
              <SubmitButton size="sm" variant="outline" pendingText="Fetching...">
                <Globe className="size-3.5" /> {source === "website" ? "Fetch again" : "Use website icon"}
              </SubmitButton>
            </form>
          ) : null}
          {src ? (
            <form action={removeAction}>
              <SubmitButton size="sm" variant="ghost" pendingText="Removing...">
                <Trash2 className="size-3.5" /> Remove
              </SubmitButton>
            </form>
          ) : null}
        </div>
        {!website ? (
          <p className="text-xs text-muted-foreground">
            Add their website below to pick up its icon automatically.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
