import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IntegrationCredentials } from "./integration-credentials";
import type { FieldDescription, Integration } from "@/lib/instance-config";

export type FileServiceSetup = {
  integration: Integration;
  label: string;
  configured: boolean;
  fields: FieldDescription[];
  callbackUrl: string;
  appUrl: string;
  appLabel: string;
  /** What to set on the provider's side, besides the callback URL. */
  notes: string;
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
          Set up the services your documents live in. Once one is set up here, each person
          connects their own account on their profile to browse and link documents with their
          own access.
        </p>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {services.map((s) => (
          <div key={s.integration} className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              {s.label}
              {s.configured ? <CheckCircle2 className="size-3.5 text-chart-3" aria-label="Set up" /> : null}
            </p>
            <p className="text-xs text-muted-foreground">{s.notes}</p>
            <IntegrationCredentials
              integration={s.integration}
              fields={s.fields}
              configured={s.configured}
              canEdit={canEdit}
              callbackUrl={s.callbackUrl}
              callbackLabel="redirect URI"
              appUrl={s.appUrl}
              appLabel={s.appLabel}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
