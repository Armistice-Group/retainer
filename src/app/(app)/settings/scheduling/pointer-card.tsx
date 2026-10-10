import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { IntegrationCardHeader } from "@/components/integration-card-header";
import { Button } from "@/components/ui/button";

/** On the Integrations tab: where Cal.com and Calendly connections live. */
export function SchedulingPointerCard({ connected, readOnly }: { connected: string[]; readOnly: boolean }) {
  return (
    <Card>
      <IntegrationCardHeader
        title="Scheduling"
        logos={["calcom", "calendly"]}
        status={{ connected: connected.length > 0, detail: connected.join(", ") }}
      />
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {connected.length
            ? "New people who book a call become draft clients for you to review."
            : "Bring bookings in as they happen: someone new who books an intake call becomes a draft client, and bookings from your contacts show on their client."}
        </p>
        {readOnly ? null : (
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <Link href="/settings/scheduling">{connected.length ? "Open" : "Set up"}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
