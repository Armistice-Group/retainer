import { Eye, FileText, Mail, MailOpen, BellRing } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InvoiceEventType } from "@/generated/prisma/client";

const ICONS: Record<InvoiceEventType, typeof Mail> = {
  EMAILED: Mail,
  REMINDED: BellRing,
  EMAIL_OPENED: MailOpen,
  VIEWED: Eye,
  PDF_VIEWED: FileText,
};

export type InvoiceActivityEvent = {
  id: string;
  type: InvoiceEventType;
  recipients: string[];
  detail: string | null;
  actorName: string | null;
  createdAt: Date;
};

function describe(e: InvoiceActivityEvent) {
  switch (e.type) {
    case "EMAILED":
      return `${e.actorName ?? "Someone"} emailed it to ${e.recipients.join(", ")}`;
    case "REMINDED":
      return `Reminder (${e.detail} days overdue) sent to ${e.recipients.join(", ")}`;
    case "EMAIL_OPENED":
      return "Client opened the email";
    case "VIEWED":
      return "Client viewed the invoice";
    case "PDF_VIEWED":
      return "Client opened the PDF";
  }
}

/** Emails, reminders and client opens, newest first. */
export function InvoiceActivity({
  events,
  viewCount,
}: {
  events: InvoiceActivityEvent[];
  viewCount: number;
}) {
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Activity</CardTitle>
        <p className="text-xs text-muted-foreground">
          {viewCount
            ? `Opened ${viewCount} time${viewCount === 1 ? "" : "s"} by the client.`
            : "Not opened by the client yet."}
        </p>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Email it or share its client link to track when it&apos;s opened.
          </p>
        ) : (
          <ul className="flex flex-col gap-3 text-sm">
            {events.map((e) => {
              const Icon = ICONS[e.type];
              return (
                <li key={e.id} className="flex gap-2">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="break-words">{describe(e)}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.createdAt.toLocaleString("en-US", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
