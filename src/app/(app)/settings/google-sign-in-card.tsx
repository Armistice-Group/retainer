import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { DocsLink } from "@/components/docs-link";

/** "Continue with Google" on the login page, for the whole instance. */
export function GoogleSignInCard({
  configured,
  callbackUrl,
  credentials,
}: {
  configured: boolean;
  callbackUrl: string;
  credentials: React.ReactNode;
}) {
  return (
    <Card>
      <IntegrationCardHeader
        title="Google sign-in"
        logos={["google"]}
        status={{ connected: configured, connectedLabel: "On", notConnectedLabel: "Off" }}
      />
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {configured
            ? "The login page shows Continue with Google. It never creates accounts on its own: a new Google user needs an invite or an auto-join domain."
            : "Optional. Shows Continue with Google on the login page, for people with an account here (or an invite, or an auto-join domain)."}
        </p>
        {configured ? null : (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to set this up</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>In the Google Cloud console, pick or create a project.</li>
              <li>
                Google Auth Platform: click <strong>Get started</strong> and fill in the app name and
                emails. Audience: <strong>Internal</strong> if everyone uses your Google Workspace,
                otherwise <strong>External</strong> (then <strong>Publish app</strong>).
              </li>
              <li>
                Clients → <strong>Create client</strong>, type <strong>Web application</strong>, and
                add this authorized redirect URI: <code className="break-all">{callbackUrl}</code>
              </li>
              <li>Paste the client ID and secret below and save.</li>
            </ol>
            <DocsLink page="self-hosting#google-sign-in" />
          </details>
        )}
        {credentials}
      </CardContent>
    </Card>
  );
}
