"use client";

import { useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Trash2, KeyRound } from "lucide-react";
import {
  startPasskeyRegistrationAction,
  finishPasskeyRegistrationAction,
  deletePasskeyAction,
} from "@/actions/passkey";

export type PasskeyRow = {
  id: string;
  deviceName: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export function PasskeysCard({ passkeys: initialPasskeys }: { passkeys: PasskeyRow[] }) {
  const [passkeys, setPasskeys] = useState(initialPasskeys);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");

  function addPasskey() {
    setError(null);
    startTransition(async () => {
      try {
        const { options, challengeId } = await startPasskeyRegistrationAction();
        const response = await startRegistration({ optionsJSON: options });
        const result = await finishPasskeyRegistrationAction(challengeId, response, deviceName);
        if (result.error) {
          setError(result.error);
        } else {
          setDeviceName("");
          window.location.reload();
        }
      } catch {
        setError("Couldn't add a passkey. Your browser or device may not support them.");
      }
    });
  }

  async function remove(id: string) {
    setPasskeys((prev) => prev.filter((p) => p.id !== id));
    await deletePasskeyAction(id);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Passkeys</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Sign in with your device&apos;s fingerprint, face, or security key instead of a
          password.
        </p>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {passkeys.length > 0 ? (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {passkeys.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{p.deviceName || "Unnamed passkey"}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {new Date(p.createdAt).toLocaleDateString()}
                      {p.lastUsedAt
                        ? ` · Last used ${new Date(p.lastUsedAt).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="size-7" onClick={() => remove(p.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-col gap-2 sm:max-w-xs">
          <Label htmlFor="passkey-name">Name this device (optional)</Label>
          <Input
            id="passkey-name"
            placeholder="e.g. MacBook Pro"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
        </div>
        <Button className="self-start" disabled={isPending} onClick={addPasskey}>
          {isPending ? "Adding..." : "Add a passkey"}
        </Button>
      </CardContent>
    </Card>
  );
}
