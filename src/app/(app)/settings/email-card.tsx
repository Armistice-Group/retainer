import { Mail } from "lucide-react";
import { IntegrationRow } from "@/components/integration-row";
import type { IntegrationLogoName } from "@/components/integration-logo";
import type { EmailProvider } from "@/lib/email";

/** Outgoing email (Resend or SMTP). Without it, invite and review links are
 * shown to copy and magic-link login is hidden. */
export function EmailCard({
  configured,
  provider,
  detail,
  defaultOpen,
  children,
}: {
  configured: boolean;
  provider: EmailProvider;
  /** The from address or SMTP server, shown after "Connected". */
  detail: string | null;
  defaultOpen?: boolean;
  /** The settings form (see email-settings.tsx). */
  children: React.ReactNode;
}) {
  const logos: IntegrationLogoName[] = configured && provider === "resend" ? ["resend"] : [];
  return (
    <IntegrationRow
      id="email"
      title="Email"
      logos={logos}
      icon={<Mail />}
      status={{
        connected: configured,
        connectedLabel: provider === "smtp" ? "SMTP" : "Resend",
        detail,
        notConnectedLabel: "Not set up",
      }}
      description={
        configured
          ? "Invoices, reminders, invites and login links go out by email."
          : "Send invoices, reminders, invites and login links by email, through Resend or any SMTP server."
      }
      defaultOpen={defaultOpen}
    >
      {children}
    </IntegrationRow>
  );
}
