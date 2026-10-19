import { IntegrationRow } from "@/components/integration-row";
import { DocsLink } from "@/components/docs-link";

/** "Continue with Google" on the login page, for the whole instance. */
export function GoogleSignInCard({
  configured,
  credentials,
  defaultOpen,
}: {
  configured: boolean;
  credentials: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <IntegrationRow
      id="google-sign-in"
      title="Google sign-in"
      logos={["google"]}
      status={{ connected: configured, connectedLabel: "On", notConnectedLabel: "Off" }}
      description="Continue with Google on the login page, for people with an account here."
      defaultOpen={defaultOpen}
    >
      <p className="text-sm text-muted-foreground">
        It never creates accounts on its own: a new Google user needs an invite or an auto-join
        domain.
      </p>
      {configured ? null : (
        <div className="text-sm">
          <p className="font-medium">How to set it up</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>In the Google Cloud console, pick or create a project.</li>
            <li>
              Google Auth Platform: click <strong>Get started</strong> and fill in the app name and
              emails. Audience: <strong>Internal</strong> if everyone uses your Google Workspace,
              otherwise <strong>External</strong> (then <strong>Publish app</strong>).
            </li>
            <li>
              Clients → <strong>Create client</strong>, type <strong>Web application</strong>, and
              add the redirect URI below.
            </li>
            <li>Paste the client ID and secret below and save.</li>
          </ol>
          <DocsLink page="self-hosting#google-sign-in" />
        </div>
      )}
      {credentials}
    </IntegrationRow>
  );
}
