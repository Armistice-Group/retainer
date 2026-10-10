import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <CardHeader>
        <CardTitle className="text-base">Files & docs</CardTitle>
        <p className="text-sm text-muted-foreground">
          Set up the services your documents live in. For each one, register an app with the
          service, then paste its credentials here. After that, each person connects their own
          account under <strong>Profile → Files &amp; docs</strong> to browse and link documents
          with their own access.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {services.map((s) => (
          <div key={s.integration} className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {s.label}
              {s.configured ? <CheckCircle2 className="size-3.5 text-chart-3" aria-label="Set up" /> : null}
            </p>
            {canEdit ? (
              <details open={!s.configured} className="text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none text-sm text-foreground">
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
