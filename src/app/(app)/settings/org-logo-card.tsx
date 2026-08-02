"use client";

import { useActionState, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { SubmitButton } from "@/components/forms/submit-button";
import { uploadOrgLogoAction, removeOrgLogoAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

export function OrgLogoCard({
  previewSrc,
  readOnly,
}: {
  previewSrc: string | null;
  readOnly: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadOrgLogoAction, null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLocalPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  const shown = localPreview ?? previewSrc;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Logo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Shown on invoice PDFs in place of your org name. PNG, JPEG, WebP, or SVG, up to 2MB.
        </p>

        {state?.error ? (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/30">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary uploaded/data-URI image, not a static asset
              <img src={shown} alt="Organization logo" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-[10px] text-muted-foreground">No logo</span>
            )}
          </div>

          {!readOnly ? (
            <form action={formAction} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={onFileChange}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:hover:bg-muted"
              />
              <SubmitButton size="sm" pendingText="Uploading...">
                Upload
              </SubmitButton>
            </form>
          ) : null}
        </div>

        {!readOnly && previewSrc ? (
          <form action={removeOrgLogoAction}>
            <ConfirmSubmitButton
              variant="outline"
              size="sm"
              className="self-start"
              confirmMessage="Remove the organization logo?"
            >
              Remove logo
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
