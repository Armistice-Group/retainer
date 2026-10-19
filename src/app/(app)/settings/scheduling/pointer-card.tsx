import { IntegrationRow } from "@/components/integration-row";

/** On the Integrations tab: where Cal.com and Calendly connections live. */
export function SchedulingPointerCard({ connected, readOnly }: { connected: string[]; readOnly: boolean }) {
  return (
    <IntegrationRow
      id="scheduling"
      title="Scheduling"
      logos={["calcom", "calendly"]}
      status={{ connected: connected.length > 0, detail: connected.join(", ") }}
      description="Cal.com or Calendly: someone new who books a call becomes a draft client."
      href={readOnly ? undefined : "/settings/scheduling"}
      actionLabel={connected.length ? "Open" : "Set up"}
    />
  );
}
