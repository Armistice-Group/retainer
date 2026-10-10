"use client";

import { useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { signOutOtherSessionsAction } from "@/actions/profile";

export function SessionsCard() {
  const [isPending, startTransition] = useTransition();

  return (
    <Card id="sessions">
      <CardHeader>
        <CardTitle className="text-base">Sessions</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Signs you out on every other browser and device. You stay signed in here. API keys
          keep working — revoke those below if you need to.
        </p>
        <Button
          variant="outline"
          className="self-start"
          disabled={isPending}
          onClick={() => {
            if (window.confirm("Sign out of every other browser and device?")) {
              startTransition(() => signOutOtherSessionsAction());
            }
          }}
        >
          {isPending ? "Signing out..." : "Sign out other sessions"}
        </Button>
      </CardContent>
    </Card>
  );
}
