import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** On the Integrations tab: where Cal.com and Calendly connections live. */
export function SchedulingPointerCard({ connected, readOnly }: { connected: string[]; readOnly: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scheduling (Cal.com, Calendly)</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {connected.length
            ? `Connected: ${connected.join(", ")}. New people who book a call become draft clients for you to review.`
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
