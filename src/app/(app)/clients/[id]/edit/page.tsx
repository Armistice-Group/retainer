import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "@/actions/clients";
import { PageHeader } from "@/components/layout/page-header";
import type { ActionState } from "@/actions/auth";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client || client.orgId !== org.id) notFound();

  const boundAction = async (prevState: ActionState, formData: FormData) =>
    updateClientAction(id, prevState, formData);

  return (
    <div>
      <PageHeader title={`Edit ${client.name}`} />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Client details</CardTitle>
        </CardHeader>
        <CardContent>
          <ClientForm
            action={boundAction}
            submitLabel="Save changes"
            initialValues={{
              name: client.name,
              website: client.website,
              description: client.description,
              email: client.email,
              phone: client.phone,
              address: client.address,
              billingEmail: client.billingEmail,
              billingAddress: client.billingAddress,
              status: client.status,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
