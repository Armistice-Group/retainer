import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
      <CardHeader>
        <CardTitle className="text-base">Email</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm font-medium">Resend</p>
          {configured ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-chart-3" />
              Sending invites, login links, and invoice notices by email.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Optional. Without it, invite and review links are shown for you to share, and
              email login links are turned off.
            </p>
          )}
        </div>
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
                Paste it below, set <strong>From address</strong> to an address on that domain
                (e.g. Acme &lt;billing@mail.example.com&gt;), and click{" "}
                <strong>Save credentials</strong>. Without a from address, mail only reaches your
                own Resend account.
              </li>
            </ol>
          </details>
        )}
        {credentials}
      </CardContent>
    </Card>
  );
}
