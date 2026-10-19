import { IntegrationRow } from "@/components/integration-row";
import type { IntegrationLogoName } from "@/components/integration-logo";
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

const DESCRIPTIONS: Partial<Record<Integration, string>> = {
  googleDrive: "Link Drive files to clients and projects, and file copies there.",
  dropbox: "Link Dropbox files to clients and projects, and file copies there.",
  microsoft: "Link OneDrive and SharePoint files, and file copies there.",
  notion: "Link Notion pages to clients and projects.",
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
 * documents (each person then connects their own account on their profile).
 * One row per service. */
export function FilesIntegrationsCard({
  services,
  canEdit,
  openId,
}: {
  services: FileServiceSetup[];
  canEdit: boolean;
  /** The row to open (?open=<id>). */
  openId?: string;
}) {
  return services.map((s) => (
    <IntegrationRow
      key={s.integration}
      id={s.integration}
      title={s.label}
      logos={LOGOS[s.integration] ? [LOGOS[s.integration]!] : []}
      status={{ connected: s.configured, connectedLabel: "Set up", notConnectedLabel: "Not set up" }}
      description={DESCRIPTIONS[s.integration]}
      defaultOpen={openId === s.integration}
    >
      <p className="text-sm text-muted-foreground">
        Register an app with {s.label} once, here. Then each person connects their own account under{" "}
        <strong>Profile → Files &amp; docs</strong>{" "}to browse and link documents with their own access.
      </p>
      {canEdit && !s.configured ? (
        <div className="text-xs text-muted-foreground">
          <p className="text-sm font-medium text-foreground">How to set it up</p>
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
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">{s.callbackUrl}</code>
            <CopyButton value={s.callbackUrl} label="Copy" />
          </div>
          <p className="mt-1">Register it exactly as shown, for every address people open Consultainer on.</p>
          <DocsLink page={`integrations/files#${FILES_ANCHORS[s.integration] ?? "before-you-start"}`} />
        </div>
      ) : null}
      <IntegrationCredentials
        integration={s.integration}
        fields={s.fields}
        configured={s.configured}
        canEdit={canEdit}
        appUrl={s.appUrl}
        appLabel={s.appLabel}
      />
    </IntegrationRow>
  ));
}
