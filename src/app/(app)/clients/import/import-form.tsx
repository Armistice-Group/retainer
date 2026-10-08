"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { importClientsAction, type ImportState } from "@/actions/import";

export function ImportForm() {
  const [state, formAction] = useActionState<ImportState, FormData>(importClientsAction, null);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <form action={formAction} className="flex flex-col gap-4">
            {state?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="import-file">CSV file</Label>
              <Input id="import-file" name="file" type="file" accept=".csv,text/csv" required />
            </div>

            <Button variant="outline" size="sm" className="w-fit" asChild>
              <a href="/consultainer-import-template.csv" download>
                <Download className="size-3.5" /> Download CSV template
              </a>
            </Button>

            <SubmitButton pendingText="Importing...">Import</SubmitButton>
          </form>
        </CardContent>
      </Card>

      {state?.result ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 text-sm">
            <p className="font-medium">
              {state.result.clientsCreated} client{state.result.clientsCreated === 1 ? "" : "s"}{" "}
              created, {state.result.clientsMatched} matched to existing clients,{" "}
              {state.result.projectsCreated} project{state.result.projectsCreated === 1 ? "" : "s"}{" "}
              created.
            </p>
            {state.result.projectsSkipped > 0 ? (
              <p className="text-muted-foreground">
                {state.result.projectsSkipped} project{state.result.projectsSkipped === 1 ? "" : "s"}{" "}
                skipped — already existed under their client.
              </p>
            ) : null}
            {state.result.rowErrors.length > 0 ? (
              <div>
                <p className="text-muted-foreground">Rows with issues:</p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {state.result.rowErrors.map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex gap-3">
              <Link href="/clients" className="text-brand hover:underline">
                View clients
              </Link>
              <Link href="/projects" className="text-brand hover:underline">
                View projects
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
