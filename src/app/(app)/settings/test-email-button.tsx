"use client";

import { useState, useTransition } from "react";
import { FileText, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sendTestEmailAction } from "@/actions/instance";

/** Sends a test, or a sample of the invoice email, to any address (you by
 * default) and shows what the mail service answered, so a bad key or an
 * unverified domain shows up here rather than on an invoice. */
export function TestEmailButton({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [to, setTo] = useState(email);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const send = (kind: "basic" | "invoice") =>
    startTransition(async () => {
      const r = await sendTestEmailAction({ to, kind });
      const sentTo = to.trim() || email;
      setResult(
        r?.error
          ? { ok: false, message: r.error }
          : { ok: true, message: `Sent to ${sentTo}. Check the inbox (and spam).` }
      );
    });
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="test-email-to">Send a test to</Label>
      <Input
        id="test-email-to"
        type="email"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        placeholder={email}
        autoComplete="email"
        className="sm:max-w-sm"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => send("basic")}>
          <Send /> {pending ? "Sending..." : "Send a test email"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => send("invoice")}>
          <FileText /> Send a sample invoice email
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        The sample is what clients get with an invoice, with made-up numbers. Nothing is billed.
      </p>
      {result?.ok ? <p className="text-xs text-muted-foreground">{result.message}</p> : null}
      {result && !result.ok ? (
        <Alert variant="destructive">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
