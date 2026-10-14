"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

export function SubmitButton({
  children,
  pendingText,
  disabled,
  pending: pendingProp,
  ...props
}: ComponentProps<typeof Button> & {
  pendingText?: string;
  /** For forms submitted from onSubmit, which useFormStatus doesn't see. */
  pending?: boolean;
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {pendingText ?? "Saving..."}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
