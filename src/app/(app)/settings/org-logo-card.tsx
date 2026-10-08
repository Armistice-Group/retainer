"use client";

import { useActionState, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { uploadOrgLogoAction, removeOrgLogoAction, updateAppBrandingAction } from "@/actions/org";
import type { ActionState } from "@/actions/auth";

export function OrgLogoCard({
  previewSrc,
  readOnly,
  appBranding,
  appAccentFromBrand,
  brandColor,
}: {
  previewSrc: string | null;
  readOnly: boolean;
  appBranding: boolean;
  appAccentFromBrand: boolean;
  brandColor: string | null;
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
        <CardTitle className="text-base">Logo &amp; branding</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Shown on invoice PDFs and share pages. PNG, JPEG, WebP, or SVG, up to 2MB.
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

        <form action={updateAppBrandingAction} className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Use in the app</p>
          <div className="flex items-start gap-2">
            <Checkbox
              id="appBranding"
              name="appBranding"
              defaultChecked={appBranding}
              disabled={readOnly}
              className="mt-0.5"
            />
            <Label htmlFor="appBranding" className="flex-col items-start gap-0.5 font-normal">
              Show our logo and name
              <span className="text-xs text-muted-foreground">
                In the sidebar and on the login page, in place of Consultainer&apos;s.
              </span>
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="appAccentFromBrand"
              name="appAccentFromBrand"
              defaultChecked={appAccentFromBrand}
              disabled={readOnly || !brandColor}
              className="mt-0.5"
            />
            <Label htmlFor="appAccentFromBrand" className="flex-col items-start gap-0.5 font-normal">
              <span className="flex items-center gap-1.5">
                Use our brand color as the accent
                {brandColor ? (
                  <span
                    className="inline-block size-3 rounded-full border border-border"
                    style={{ background: brandColor }}
                  />
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {brandColor
                  ? "For links, the active page, and highlights. Adjusted for contrast in light and dark mode."
                  : "Set a brand color under Organization first."}
              </span>
            </Label>
          </div>
          {!readOnly ? (
            <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving...">
              Save branding
            </SubmitButton>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
