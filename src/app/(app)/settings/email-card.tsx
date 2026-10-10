import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { DocsLink } from "@/components/docs-link";

/** Optional outgoing email (Resend). Without it, invite and review links are
 * shown to copy and magic-link login is hidden. */
export function EmailCard({
  configured,
  credentials,
}: {
  configured: boolean;
  credentials: React.ReactNode;
}) {
  return (
    <Card>
      <IntegrationCardHeader title="Email (Resend)" logos={["resend"]} status={{ connected: configured }} />
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {configured
            ? "Sending invites, login links, and invoice notices by email."
            : "Optional. Without it, invite and review links are shown for you to share, and email login links are turned off."}
        </p>
        {configured ? null : (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to set this up</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Sign up at resend.com.</li>
              <li>
                Under <strong>Domains</strong>, add the domain you&apos;ll send from (a subdomain
                like mail.example.com works well).
              </li>
              <li>
                Add the DNS records Resend shows at your DNS provider and wait until the domain
                shows <strong>Verified</strong>.
              </li>
              <li>
                Under <strong>API Keys</strong>, create a key with <strong>Sending access</strong>{" "}
                and copy it (starts with re_).
              </li>
              <li>
                Paste it below, set <strong>From address</strong>{" "}to an address on that domain
                (e.g. Acme &lt;billing@mail.example.com&gt;), and click{" "}
                <strong>Save credentials</strong>. Without a from address, mail only reaches your
                own Resend account.
              </li>
            </ol>
            <DocsLink page="integrations/email" />
          </details>
        )}
        {credentials}
      </CardContent>
    </Card>
  );
}
