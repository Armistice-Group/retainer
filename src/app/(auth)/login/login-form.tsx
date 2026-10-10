"use client";

import { useActionState, useState } from "react";
import { loginAction, type ActionState } from "@/actions/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { PasskeySignInButton } from "@/components/auth/passkey-signin-button";
import { MagicLinkForm } from "./magic-link-form";
import { ForgotPasswordForm } from "./forgot-password-form";
import { SsoSignInButton, type SsoProvider } from "./sso-signin-button";

type Mode = "password" | "magic-link" | "forgot-password";

export function LoginForm({
  callbackUrl,
  googleEnabled,
  magicLinkEnabled,
  ssoProviders,
  initialError,
}: {
  callbackUrl: string;
  googleEnabled: boolean;
  magicLinkEnabled: boolean;
  ssoProviders: SsoProvider[];
  initialError?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(loginAction, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("password");
  const needsCode = !!state?.requiresTwoFactor;

  const description =
    mode === "magic-link"
      ? "We'll email you a link to log in — no password needed."
      : mode === "forgot-password"
        ? "Enter your email and we'll send you a link to choose a new password."
      : needsCode
        ? "Enter the 6-digit code from your authenticator app."
        : "Welcome back. Enter your details to continue.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "forgot-password" ? "Reset your password" : "Log in"}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {mode === "magic-link" ? (
          <MagicLinkForm onBack={() => setMode("password")} />
        ) : mode === "forgot-password" ? (
          <ForgotPasswordForm
            emailEnabled={magicLinkEnabled}
            onBack={() => setMode("password")}
          />
        ) : (
          <>
            {!needsCode ? (
              <div className="mb-6 flex flex-col gap-4">
                {ssoProviders.map((provider) => (
                  <SsoSignInButton key={provider.id} provider={provider} />
                ))}
                <PasskeySignInButton callbackUrl={callbackUrl} />
                {googleEnabled ? <GoogleSignInButton callbackUrl={callbackUrl} /> : null}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <div className="h-px flex-1 bg-border" />
                  OR
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            ) : null}
            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              {initialError ? (
                <Alert variant="destructive">
                  <AlertDescription>{initialError}</AlertDescription>
                </Alert>
              ) : null}
              {state?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{state.error}</AlertDescription>
                </Alert>
              ) : null}
              {!needsCode ? (
                <>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    {state?.fieldErrors?.email ? (
                      <p className="text-sm text-destructive">{state.fieldErrors.email[0]}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {magicLinkEnabled ? (
                        <button
                          type="button"
                          className="text-xs text-brand hover:underline"
                          onClick={() => setMode("magic-link")}
                        >
                          Email me a login link instead
                        </button>
                      ) : null}
                    </div>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    {state?.fieldErrors?.password ? (
                      <p className="text-sm text-destructive">{state.fieldErrors.password[0]}</p>
                    ) : null}
                    <button
                      type="button"
                      className="self-end text-xs text-brand hover:underline"
                      onClick={() => setMode("forgot-password")}
                    >
                      Forgot password?
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <input type="hidden" name="email" value={email} />
                  <input type="hidden" name="password" value={password} />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="code">Authentication code</Label>
                    <Input
                      id="code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="123456 or a recovery code"
                      autoFocus
                      required
                    />
                    {state?.fieldErrors?.code ? (
                      <p className="text-sm text-destructive">{state.fieldErrors.code[0]}</p>
                    ) : null}
                  </div>
                </>
              )}
              <SubmitButton className="mt-2 w-full" pendingText="Logging in...">
                {needsCode ? "Verify" : "Log in"}
              </SubmitButton>
            </form>
          </>
        )}
        {mode === "password" && !needsCode ? (
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Need an account? Ask an admin for an invite.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
