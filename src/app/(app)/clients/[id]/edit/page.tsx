import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "@/actions/clients";
import { PageHeader } from "@/components/layout/page-header";
import { paymentTermsLabel } from "@/lib/payment-terms";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client || client.orgId !== org.id) notFound();

  const boundAction = updateClientAction.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title={`Edit ${client.name}`} />
      <ClientForm
        action={boundAction}
        submitLabel="Save changes"
        cancelHref={`/clients/${id}`}
        orgPaymentTerms={paymentTermsLabel(org.defaultPaymentTerms)}
        initialValues={{
          name: client.name,
          website: client.website,
          description: client.description,
          email: client.email,
          phone: client.phone,
          address: client.address,
          billingEmail: client.billingEmail,
          billingAddress: client.billingAddress,
          paymentTerms: client.paymentTerms,
          status: client.status,
        }}
      />
    </div>
  );
}
