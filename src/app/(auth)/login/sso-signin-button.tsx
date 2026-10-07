import { ShieldCheck } from "lucide-react";
import { startSsoLoginAction } from "@/actions/sso";
import { SubmitButton } from "@/components/forms/submit-button";

export type SsoProvider = { id: string; label: string };

export function SsoSignInButton({ provider }: { provider: SsoProvider }) {
  return (
    <form action={startSsoLoginAction}>
      <input type="hidden" name="connectionId" value={provider.id} />
      <SubmitButton variant="outline" className="w-full" pendingText="Redirecting...">
        <ShieldCheck className="size-4" />
        Sign in with {provider.label}
      </SubmitButton>
    </form>
  );
}
