import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Mail,
  Phone,
  MapPin,
  Globe,
  Pencil,
  Star,
  Trash2,
  Plus,
  FolderKanban,
  Receipt,
  Lock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { LinkList } from "@/components/link-list";
import { AddLinkDialog } from "@/components/forms/add-link-dialog";
import { ContactDialog } from "./contact-dialog";
import { ClientDocumentsCard } from "./client-documents-card";
import { ClientShareLinkCard } from "./client-share-link-card";
import { ClientInvoicesCard } from "./client-invoices-card";
import { RecurringScheduleCard } from "./recurring-schedule-card";
import { deleteClientAction, deleteContactAction } from "@/actions/clients";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { EmptyState } from "@/components/empty-state";
import { websiteHref } from "@/lib/format";
import { projectVisibilityWhere } from "@/lib/project-access";
import { getOrigin } from "@/lib/url";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: justCreated } = await searchParams;
  const { org, user, role } = await requireOrgContext();

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      links: { orderBy: { createdAt: "asc" } },
      projects: { where: projectVisibilityWhere(user.id, role), orderBy: { createdAt: "desc" } },
      documents: { orderBy: { uploadedAt: "desc" } },
      recurringInvoiceSchedules: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!client || client.orgId !== org.id) notFound();

  const canManage = role === "OWNER" || role === "ADMIN";
  const origin = canManage ? await getOrigin() : "";

  const [invoices, retainerAgg, loggedAgg] = await Promise.all([
    prisma.invoice.findMany({ where: { clientId: client.id }, orderBy: { createdAt: "desc" } }),
    prisma.invoice.aggregate({
      where: { clientId: client.id, status: { not: "VOID" }, retainerHoursIncluded: { not: null } },
      _sum: { retainerHoursIncluded: true },
    }),
    prisma.timeEntry.aggregate({
      where: { project: { clientId: client.id } },
      _sum: { hours: true },
    }),
  ]);

  const invoiceItems = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    dueDate: inv.dueDate.toISOString(),
    total: Number(inv.total),
    currency: inv.currency,
  }));

  const entitledHours = Number(retainerAgg._sum.retainerHoursIncluded ?? 0);
  const retainerBalance =
    entitledHours > 0
      ? { entitledHours, loggedHours: Number(loggedAgg._sum.hours ?? 0) }
      : null;

  const documentItems = client.documents.map((d) => ({
    id: d.id,
    type: d.type,
    label: d.label,
    fileName: d.fileName,
    uploadedAt: d.uploadedAt.toISOString(),
  }));

  const recurringScheduleItems = client.recurringInvoiceSchedules.map((s) => ({
    id: s.id,
    description: s.description,
    amount: Number(s.amount),
    currency: org.defaultCurrency,
    interval: s.interval,
    active: s.active,
    autoSend: s.autoSend,
    nextRunAt: s.nextRunAt.toISOString(),
    lastRunAt: s.lastRunAt ? s.lastRunAt.toISOString() : null,
  }));

  return (
    <div>
      <PageHeader
        title={client.name}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Pencil className="size-3.5" /> Edit
              </Link>
            </Button>
            <form action={deleteClientAction.bind(null, client.id)}>
              <ConfirmSubmitButton
                variant="outline"
                size="sm"
                confirmMessage={`Delete ${client.name}? This also removes their projects and time entries.`}
              >
                <Trash2 className="size-3.5" /> Delete
              </ConfirmSubmitButton>
            </form>
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <StatusBadge status={client.status} />
      </div>

      {justCreated && client.contacts.length === 0 ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>{client.name}</strong>{" "}
              was created. Add the people you&apos;ll be working with here — a manager, VP,
              marketing lead, whoever&apos;s relevant — or skip for now.
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <ContactDialog clientId={client.id} />
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/clients/${client.id}`}>Skip for now</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact info</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {client.description ? (
                <p className="text-muted-foreground">{client.description}</p>
              ) : null}
              {client.website ? (
                <div className="flex items-center gap-2">
                  <Globe className="size-4 shrink-0 text-muted-foreground" />
                  <a
                    href={websiteHref(client.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {client.website}
                  </a>
                </div>
              ) : null}
              {client.email ? (
                <div className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-muted-foreground" />
                  <a href={`mailto:${client.email}`} className="hover:underline">
                    {client.email}
                  </a>
                </div>
              ) : null}
              {client.phone ? (
                <div className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-muted-foreground" />
                  <span>{client.phone}</span>
                </div>
              ) : null}
              {client.address ? (
                <div className="flex items-center gap-2">
                  <MapPin className="size-4 shrink-0 text-muted-foreground" />
                  <span>{client.address}</span>
                </div>
              ) : null}
              {!client.description &&
              !client.website &&
              !client.email &&
              !client.phone &&
              !client.address ? (
                <p className="text-muted-foreground">No contact details on file.</p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <a
                  href={`mailto:${client.billingEmail || client.email || ""}`}
                  className="hover:underline"
                >
                  {client.billingEmail || client.email || "No billing email on file"}
                </a>
                {!client.billingEmail && client.email ? (
                  <span className="text-xs text-muted-foreground">(default)</span>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span>
                  {client.billingAddress || client.address || "No billing address on file"}
                </span>
                {!client.billingAddress && client.address ? (
                  <span className="text-xs text-muted-foreground">(default)</span>
                ) : null}
              </div>
              {client.contacts.some((c) => c.receivesInvoices) ? (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">On invoice emails</p>
                  <div className="flex flex-wrap gap-1.5">
                    {client.contacts
                      .filter((c) => c.receivesInvoices)
                      .map((c) => (
                        <Badge key={c.id} variant="secondary">
                          {c.name}
                        </Badge>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No contacts marked to receive invoice emails.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Points of contact</CardTitle>
              <ContactDialog clientId={client.id} />
            </CardHeader>
            <CardContent>
              {client.contacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contacts added yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {client.contacts.map((contact) => (
                    <li key={contact.id} className="flex items-start justify-between gap-2 py-2.5">
                      <div className="text-sm">
                        <div className="flex flex-wrap items-center gap-1.5 font-medium">
                          {contact.name}
                          {contact.isPrimary ? (
                            <Star className="size-3.5 fill-primary text-primary" />
                          ) : null}
                          {contact.receivesInvoices ? (
                            <Receipt className="size-3.5 text-muted-foreground" />
                          ) : null}
                        </div>
                        {contact.title || contact.contactRole ? (
                          <p className="text-muted-foreground">
                            {[contact.title, contact.contactRole].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="text-muted-foreground hover:underline">
                            {contact.email}
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <p className="text-muted-foreground">{contact.phone}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <ContactDialog clientId={client.id} contact={contact} />
                        <form
                          action={deleteContactAction.bind(null, contact.id, client.id)}
                        >
                          <Button variant="ghost" size="icon" className="size-7" type="submit">
                            <Trash2 className="size-3.5" />
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Links</CardTitle>
              <AddLinkDialog clientId={client.id} />
            </CardHeader>
            <CardContent>
              <LinkList links={client.links} redirectPath={`/clients/${client.id}`} />
            </CardContent>
          </Card>

          <ClientDocumentsCard clientId={client.id} documents={documentItems} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Projects</CardTitle>
              <Button size="sm" asChild>
                <Link href={`/projects/new?clientId=${client.id}`}>
                  <Plus className="size-3.5" /> New project
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {client.projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description="Create a project under this client to start tracking time and billing."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {client.projects.map((project) => (
                    <li key={project.id}>
                      <Link
                        href={`/projects/${project.id}`}
                        className="flex items-center justify-between gap-2 py-3 text-sm hover:underline"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {project.confidential ? (
                            <Lock className="size-3.5 shrink-0 text-chart-4" />
                          ) : null}
                          {project.name}
                        </span>
                        <StatusBadge status={project.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <ClientInvoicesCard
            clientId={client.id}
            invoices={invoiceItems}
            retainerBalance={retainerBalance}
          />

          {canManage ? (
            <ClientShareLinkCard
              clientId={client.id}
              shareUrl={client.shareToken ? `${origin}/share/client/${client.shareToken}` : null}
            />
          ) : null}

          {canManage ? (
            <RecurringScheduleCard clientId={client.id} schedules={recurringScheduleItems} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
