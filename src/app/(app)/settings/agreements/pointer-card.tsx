import { IntegrationRow } from "@/components/integration-row";

/** On the Integrations tab: where e-signature connections live. */
export function AgreementsPointerCard({ connected, readOnly }: { connected: string[]; readOnly: boolean }) {
  return (
    <IntegrationRow
      id="agreements"
      title="Signed agreements"
      logos={["docusign", "documenso", "ironclad"]}
      status={{ connected: connected.length > 0, detail: connected.join(", ") }}
      description="DocuSign, Documenso or Ironclad: completed agreements arrive to link to clients and projects."
      href={readOnly ? undefined : "/settings/agreements"}
      actionLabel={connected.length ? "Open" : "Set up"}
    />
  );
}
