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
        {credentials}
      </CardContent>
    </Card>
  );
}
