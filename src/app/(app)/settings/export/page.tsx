import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ClientExportForm } from "./client-export-form";

export default async function ExportSettingsPage() {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") notFound();

  const clients = await prisma.client.findMany({
    where: { orgId: org.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      {role === "OWNER" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Everything</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p className="text-muted-foreground">
              A ZIP of all of {org.name}&apos;s data: a CSV and a JSON file for clients,
              contacts, projects, members, time, expenses, invoices and their lines, payments,
              milestones, tasks, documents and the audit log, plus every uploaded file and each
              invoice as a PDF.
            </p>
            <p className="text-muted-foreground">
              Passwords, two-factor secrets, API keys, share links and integration credentials
              are never included. The download is recorded in the audit log.
            </p>
            <Button asChild className="w-fit">
              <a href="/api/export/org" download>
                <Download className="size-3.5" /> Download everything
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Large organizations take a while: the file is built as it downloads.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">One client</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">
            The same, for one client only: its contacts, projects, time, expenses, invoices,
            payments, milestones, tasks and documents, and the people who worked on it (name,
            email and role — not what they cost you). Useful when handing a client&apos;s
            records over.
          </p>
          {clients.length === 0 ? (
            <p className="text-muted-foreground">No clients yet.</p>
          ) : (
            <ClientExportForm clients={clients} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
