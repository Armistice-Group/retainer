"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sendTestEmailAction } from "@/actions/instance";

/** Sends a test to the signed-in user and shows what Resend answered, so a
 * bad key or an unverified domain shows up here rather than on an invoice. */
export function TestEmailButton({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const r = await sendTestEmailAction();
              setResult(r?.error ? { ok: false, message: r.error } : { ok: true, message: `Sent to ${email}. Check your inbox (and spam).` });
            })
          }
        >
          <Send /> {pending ? "Sending..." : "Send a test email"}
        </Button>
        {result?.ok ? <span className="text-xs text-muted-foreground">{result.message}</span> : null}
      </div>
      {result && !result.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
