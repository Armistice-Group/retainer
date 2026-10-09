"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dismissSetupCardAction } from "@/actions/profile";

export function DismissSetupCardButton() {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-mr-2 -mt-1 shrink-0 text-muted-foreground"
      disabled={pending}
      title="Integrations stay available under Settings"
      onClick={() => startTransition(() => dismissSetupCardAction())}
    >
      <X />
      Don&apos;t show again
    </Button>
  );
}
