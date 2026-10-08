import { ClientForm } from "../client-form";
import { createClientAction } from "@/actions/clients";
import { PageHeader } from "@/components/layout/page-header";

export default function NewClientPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Add a client"
        description="Create a new client to organize projects and invoices under."
      />
      <ClientForm action={createClientAction} submitLabel="Create client" cancelHref="/clients" />
    </div>
  );
}
