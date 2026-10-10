import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/** On the Integrations tab: where e-signature connections live. */
export function AgreementsPointerCard({ connected, readOnly }: { connected: string[]; readOnly: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signed agreements (DocuSign, Documenso, Ironclad)</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {connected.length
            ? `Connected: ${connected.join(", ")}. Signed agreements arrive hourly for you to link to clients and projects.`
            : "Pull completed agreements in, link them to clients and projects, and keep a copy of each signed PDF."}
        </p>
        {readOnly ? null : (
          <Button size="sm" variant="outline" asChild className="shrink-0">
            <Link href="/settings/agreements">{connected.length ? "Open" : "Set up"}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
