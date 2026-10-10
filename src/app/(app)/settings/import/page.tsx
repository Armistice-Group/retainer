import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireOrgContext } from "@/lib/org-context";
import { listImportBatches } from "@/lib/portability/import";
import { KIND_LABELS, SOURCE_LABELS, type ImportKind, type ImportSource } from "@/lib/portability/import-fields";
import { ImportWizard } from "./import-wizard";
import { UndoImportForm } from "./undo-import-form";

export default async function ImportSettingsPage() {
  const { org, role } = await requireOrgContext();
  if (role !== "OWNER" && role !== "ADMIN") notFound();

  const batches = await listImportBatches(org.id);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from Harvest, Toggl Track or Clockify</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Upload a CSV of time entries (or a list of clients or projects). You&apos;ll see what
            will be created and who each person in the file is before anything is imported.
            Importing the same file again only adds rows that aren&apos;t in yet.
          </p>
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">How to export from your old tool</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
              <li>
                <strong>Harvest:</strong> Reports → Detailed time, pick the date range (All time
                for everything), then Export → CSV.
              </li>
              <li>
                <strong>Toggl Track:</strong> Reports → Detailed, pick the date range, then the
                export (download) button → Download CSV.
              </li>
              <li>
                <strong>Clockify:</strong> Reports → Detailed, pick the date range, then Export →
                Save as CSV.
              </li>
              <li>
                <strong>Anything else:</strong>{" "}any CSV with a date, hours (or a duration) and a
                project per row. You&apos;ll match its columns on the next step.
              </li>
            </ol>
          </details>
          <ImportWizard />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Past imports</CardTitle>
        </CardHeader>
        <CardContent>
          {batches.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {batches.map((b) => (
                <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{b.fileName}</span>
                      <Badge variant="outline">
                        {SOURCE_LABELS[b.source as ImportSource] ?? b.source} ·{" "}
                        {KIND_LABELS[b.kind as ImportKind] ?? b.kind}
                      </Badge>
                      {b.undoneAt ? <Badge variant="secondary">Undone</Badge> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {b.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                      {b.createdByName ? ` by ${b.createdByName}` : ""} · {b.entriesCreated} entries,{" "}
                      {b.projectsCreated} new projects, {b.clientsCreated} new clients, {b.rowsSkipped} rows
                      skipped
                    </p>
                    {!b.undoneAt && b.invoicedEntries > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {b.invoicedEntries}{" "}of its entries are on invoices, so it can&apos;t be undone.
                      </p>
                    ) : null}
                  </div>
                  {!b.undoneAt && b.invoicedEntries === 0 ? (
                    <UndoImportForm batchId={b.id} entries={b.entriesCreated} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
