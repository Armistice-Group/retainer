import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientForm } from "../client-form";
import { createClientAction } from "@/actions/clients";
import { PageHeader } from "@/components/layout/page-header";

export default function NewClientPage() {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="Add a client" description="Create a new client to organize projects and invoices under." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm action={createClientAction} submitLabel="Create client" />
        </CardContent>
      </Card>
    </div>
  );
}
