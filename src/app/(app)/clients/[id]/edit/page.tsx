import { notFound } from "next/navigation";
import { BackLink } from "@/components/layout/back-link";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { ClientForm } from "../../client-form";
import { updateClientAction } from "@/actions/clients";
import { PageHeader } from "@/components/layout/page-header";
import { paymentTermsLabel } from "@/lib/payment-terms";
import { clientLogoUrl } from "@/lib/services/client-logos";
import { ClientLogoCard } from "./client-logo-card";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const client = await prisma.client.findUnique({
    where: { id },
    include: { logo: { select: { source: true } } },
  });
  if (!client || client.orgId !== org.id) notFound();

  const boundAction = updateClientAction.bind(null, id);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <BackLink href={`/clients/${client.id}`}>{client.name}</BackLink>
      <PageHeader title={`Edit ${client.name}`} />
      <ClientLogoCard
        clientId={client.id}
        name={client.name}
        src={clientLogoUrl(client)}
        source={client.logo?.source === "upload" || client.logo?.source === "website" ? client.logo.source : null}
        website={client.website}
      />
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
          invoiceReminders: client.invoiceReminders,
          requireClockTimes: client.requireClockTimes,
          invoiceTimeDetail: client.invoiceTimeDetail,
          attachInvoicePdf: client.attachInvoicePdf,
          status: client.status,
        }}
      />
    </div>
  );
}
