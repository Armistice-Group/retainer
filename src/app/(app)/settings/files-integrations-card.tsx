import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader, IntegrationStatus } from "@/components/integration-card-header";
import { IntegrationLogo, type IntegrationLogoName } from "@/components/integration-logo";
import { CopyButton } from "@/components/copy-button";
import { IntegrationCredentials } from "./integration-credentials";
import type { FieldDescription, Integration } from "@/lib/instance-config";

// Each service's section in docs/integrations/files.mdx.
const FILES_ANCHORS: Partial<Record<Integration, string>> = {
  googleDrive: "set-up-google-drive",
  dropbox: "set-up-dropbox",
  microsoft: "set-up-onedrive--sharepoint",
  notion: "set-up-notion",
};
import { DocsLink } from "@/components/docs-link";

const LOGOS: Partial<Record<Integration, IntegrationLogoName>> = {
  googleDrive: "google-drive",
  dropbox: "dropbox",
  microsoft: "onedrive",
  notion: "notion",
};

export type FileServiceSetup = {
  integration: Integration;
  label: string;
  configured: boolean;
  fields: FieldDescription[];
  callbackUrl: string;
  appUrl: string;
  appLabel: string;
  /** How to register the app on the provider's side, one action per step. */
  steps: readonly string[];
};

/** Instance credentials for the file services people connect to link
 * documents (each person then connects their own account on their profile). */
export function FilesIntegrationsCard({
  services,
  canEdit,
}: {
  services: FileServiceSetup[];
  canEdit: boolean;
}) {
  return (
    <Card className="lg:col-span-2">
      <IntegrationCardHeader
        title="Files & docs"
        logos={services.flatMap((s) => LOGOS[s.integration] ?? [])}
        status={{
          connected: services.some((s) => s.configured),
          connectedLabel: "Set up",
          detail: `${services.filter((s) => s.configured).length} of ${services.length}`,
          notConnectedLabel: "Not set up",
        }}
        description={
          <>
            Set up the services your documents live in. For each one, register an app with the
            service, then paste its credentials here. After that, each person connects their own
            account under <strong>Profile → Files &amp; docs</strong> to browse and link documents
            with their own access.
          </>
        }
      />
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {services.map((s) => (
          <div key={s.integration} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                {LOGOS[s.integration] ? <IntegrationLogo name={LOGOS[s.integration]!} className="size-4" /> : null}
                {s.label}
              </p>
              <IntegrationStatus connected={s.configured} connectedLabel="Set up" notConnectedLabel="Not set up" />
            </div>
            {canEdit ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none text-sm font-medium text-foreground">
                  How to set this up
                </summary>
                <p className="mt-2">
                  Open{" "}
                  <a href={s.appUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                    {s.appLabel}
                  </a>
                  , then:
                </p>
                <ol className="mt-1 list-decimal space-y-1 pl-4">
                  {s.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <p className="mt-2 font-medium text-foreground">Redirect URI</p>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                    {s.callbackUrl}
                  </code>
                  <CopyButton value={s.callbackUrl} label="Copy" />
                </div>
                <p className="mt-1">
                  Register it exactly as shown, for every address people open Consultainer on.
                </p>
                <DocsLink page={`integrations/files#${FILES_ANCHORS[s.integration] ?? "before-you-start"}`} />
              </details>
            ) : null}
            <IntegrationCredentials
              integration={s.integration}
              fields={s.fields}
              configured={s.configured}
              canEdit={canEdit}
              appUrl={s.appUrl}
              appLabel={s.appLabel}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
