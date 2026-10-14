import Link from "next/link";
import { BackLink } from "@/components/layout/back-link";
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
  CalendarClock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/status-badge";
import { ClientAvatar } from "@/components/client-avatar";
import { clientLogoUrl } from "@/lib/services/client-logos";
import { PageHeader } from "@/components/layout/page-header";
import { LinkList } from "@/components/link-list";
import { AddLinkDialog } from "@/components/forms/add-link-dialog";
import { ContactDialog } from "./contact-dialog";
import { DocumentsCard } from "@/components/documents/documents-card";
import { documentCardData } from "@/lib/services/documents";
import { AgreementsCard } from "@/components/agreements/agreements-card";
import { agreementsCardData } from "@/lib/services/agreements";
import { CredentialsCard } from "@/components/vault-links/credentials-card";
import { canManageVaultLinks, listVaultLinks } from "@/lib/services/vault-links";
import { ClientShareLinkCard } from "./client-share-link-card";
import { clientShareCardData } from "@/lib/services/share-visitors";
import { ClientInvoicesCard } from "./client-invoices-card";
import { ClientCreditCard } from "./client-credit-card";
import { RecurringScheduleCard } from "./recurring-schedule-card";
import { BillingCycleCard } from "./billing-cycle-card";
import { PaymentMethodsEditor, type EditableMethod } from "@/components/payment-methods-editor";
import { OrgPaymentMethodsPicker } from "./org-payment-methods";
import { displayPaymentMethod } from "@/lib/payment-methods";
import { deleteClientAction, deleteContactAction } from "@/actions/clients";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { EmptyState } from "@/components/empty-state";
import { websiteHref } from "@/lib/format";
import { paymentTermsLabel } from "@/lib/payment-terms";
import { invoiceVisibilityWhere, projectVisibilityWhere } from "@/lib/project-access";
import { getOrigin } from "@/lib/url";
import { clientBookings, DISCARD_PURGE_DAYS } from "@/lib/services/scheduling";
import { DraftBanner } from "./draft-banner";
import { BookingsCard } from "./bookings-card";
import { BookingLinkCard } from "./booking-link-card";

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
      recurringInvoiceSchedules: { orderBy: { createdAt: "asc" } },
      billingCycle: true,
    },
  });

  if (!client || client.orgId !== org.id) notFound();

  const canManage = role === "OWNER" || role === "ADMIN";
  // Mirrors defaultInvoiceRecipients: contacts marked "receives invoices"
  // (with an email) first, else the billing email, else the main email.
  const invoiceContacts = client.contacts.filter((c) => c.receivesInvoices && c.email);
  const contactsMissingEmail = client.contacts.filter((c) => c.receivesInvoices && !c.email);
  const fallbackInvoiceEmail = client.billingEmail || client.email;
  // A draft client (from a Cal.com/Calendly booking) has no billing, share
  // link or projects until it's made a client.
  const isDraft = client.status === "LEAD";
  const origin = canManage ? await getOrigin() : "";
  const shareCard = canManage && !isDraft ? await clientShareCardData(org, client) : null;
  const bookings = await clientBookings(org.id, client.id);
  const mergeTargets =
    isDraft && canManage
      ? await prisma.client.findMany({
          where: { orgId: org.id, status: { not: "LEAD" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : [];

  // Retainer balance: hours on retainer invoices actually sent (drafts and
  // voids don't count) against billable time logged since the first hourly
  // retainer started, leaving out time already billed by the hour.
  const retainerStart = client.recurringInvoiceSchedules
    .filter((s) => s.retainerHours != null)
    .reduce<Date | null>((earliest, s) => (!earliest || s.createdAt < earliest ? s.createdAt : earliest), null);
  const retainerStartDay = retainerStart
    ? new Date(Date.UTC(retainerStart.getUTCFullYear(), retainerStart.getUTCMonth(), retainerStart.getUTCDate()))
    : null;
  const [invoices, retainerAgg, loggedAgg] = await Promise.all([
    prisma.invoice.findMany({
      where: { clientId: client.id, ...invoiceVisibilityWhere(user.id, role) },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.aggregate({
      where: { clientId: client.id, status: { in: ["SENT", "PAID"] }, retainerHoursIncluded: { not: null } },
      _sum: { retainerHoursIncluded: true },
    }),
    retainerStartDay
      ? prisma.timeEntry.aggregate({
          where: {
            project: { clientId: client.id },
            billable: true,
            invoiceLineItemId: null,
            date: { gte: retainerStartDay },
          },
          _sum: { hours: true },
        })
      : Promise.resolve({ _sum: { hours: null } }),
  ]);

  const invoiceItems = invoices.map((inv) => ({
    id: inv.id,
    number: inv.number,
    status: inv.status,
    dueDate: inv.dueDate.toISOString(),
    total: Number(inv.total),
    amountPaid: Number(inv.amountPaid),
    creditApplied: Number(inv.creditApplied),
    currency: inv.currency,
    kind: inv.kind,
  }));

  const entitledHours = Number(retainerAgg._sum.retainerHoursIncluded ?? 0);
  const retainerBalance =
    entitledHours > 0 ? { entitledHours, loggedHours: Number(loggedAgg._sum.hours ?? 0) } : null;

  const documentsCard = await documentCardData(
    { orgId: org.id, userId: user.id, role },
    { clientId: client.id }
  );
  const agreementsCard = await agreementsCardData(
    { orgId: org.id, userId: user.id, role },
    { clientId: client.id }
  );
  const vaultLinks = await listVaultLinks({ orgId: org.id, userId: user.id, role }, { clientId: client.id });

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

  const [clientMethods, orgMethods] = await Promise.all([
    prisma.paymentMethod.findMany({
      where: { orgId: org.id, clientId: client.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, label: true, details: true, showOnPdf: true },
    }),
    prisma.paymentMethod.findMany({
      where: { orgId: org.id, clientId: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  const cycle = client.billingCycle;
  const lastCycleInvoice = cycle?.lastInvoiceId
    ? await prisma.invoice.findFirst({
        where: { id: cycle.lastInvoiceId, ...invoiceVisibilityWhere(user.id, role) },
        select: { id: true, number: true },
      })
    : null;
  const billingCycleItem = cycle
    ? {
        interval: cycle.interval,
        paymentTerms: cycle.paymentTerms,
        autoSend: cycle.autoSend,
        active: cycle.active,
        nextRunAt: cycle.nextRunAt.toISOString(),
        lastRunAt: cycle.lastRunAt ? cycle.lastRunAt.toISOString() : null,
        lastInvoice: lastCycleInvoice,
        lastRunNote: cycle.lastRunNote,
      }
    : null;

  return (
    <div>
      <BackLink href={client.status === "LEAD" ? "/clients?view=drafts" : "/clients"}>
        {client.status === "LEAD" ? "Drafts" : "Clients"}
      </BackLink>
      <PageHeader
        title={client.name}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/clients/${client.id}/edit`}>
                <Pencil className="size-3.5" /> Edit
              </Link>
            </Button>
            {canManage ? (
              <form action={deleteClientAction.bind(null, client.id)}>
                <ConfirmSubmitButton
                  variant="outline"
                  size="sm"
                  confirmMessage={`Delete ${client.name}? This also permanently removes their projects, time entries and invoices (including paid ones).`}
                >
                  <Trash2 className="size-3.5" /> Delete
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <ClientAvatar name={client.name} src={clientLogoUrl(client)} className="size-12 text-sm" />
        <StatusBadge status={client.status} />
      </div>

      {isDraft ? (
        <DraftBanner
          clientId={client.id}
          clientName={client.name}
          source={client.leadSource}
          bookedAt={client.leadBookedAt?.toISOString() ?? null}
          discardedAt={client.leadDiscardedAt?.toISOString() ?? null}
          purgeAt={
            client.leadDiscardedAt
              ? new Date(client.leadDiscardedAt.getTime() + DISCARD_PURGE_DAYS * 86_400_000).toISOString()
              : null
          }
          canManage={canManage}
          mergeTargets={mergeTargets}
        />
      ) : null}

      {justCreated && client.contacts.length === 0 ? (
        <Alert className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>
              <strong>{client.name}</strong>{" "}was created. Add the people you&apos;ll be working with
              here — a manager, VP, marketing lead, whoever&apos;s relevant — or skip for now.
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contact info</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {client.description ? (
                <div>
                  <p className="mb-0.5 text-xs text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-line">{client.description}</p>
                </div>
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

          {isDraft ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Billing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Invoices are emailed to</p>
                {invoiceContacts.length ? (
                  <ul className="flex flex-col gap-1">
                    {invoiceContacts.map((c) => (
                      <li key={c.id} className="flex min-w-0 items-center gap-2">
                        <Mail className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">
                          {c.name}{" "}
                          <a href={`mailto:${c.email}`} className="text-muted-foreground hover:underline">
                            {c.email}
                          </a>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : fallbackInvoiceEmail ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <Mail className="size-4 shrink-0 text-muted-foreground" />
                    <a href={`mailto:${fallbackInvoiceEmail}`} className="truncate hover:underline">
                      {fallbackInvoiceEmail}
                    </a>
                    {!client.billingEmail ? (
                      <span className="shrink-0 text-xs text-muted-foreground">(client email)</span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Nobody yet. Add a billing email, or mark a contact to receive invoices.
                  </p>
                )}
                {invoiceContacts.length && client.billingEmail ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    The billing email ({client.billingEmail}) isn&apos;t used while contacts are
                    marked to receive invoices.
                  </p>
                ) : null}
                {contactsMissingEmail.length ? (
                  <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
                    {contactsMissingEmail.map((c) => c.name).join(", ")}{" "}
                    {contactsMissingEmail.length === 1 ? "is" : "are"} marked to receive invoices
                    but {contactsMissingEmail.length === 1 ? "has" : "have"} no email address.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                {client.billingAddress || client.address ? (
                  <span className="whitespace-pre-line">{client.billingAddress || client.address}</span>
                ) : (
                  <span className="text-muted-foreground">No billing address</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                <span>{paymentTermsLabel(client.paymentTerms ?? org.defaultPaymentTerms)}</span>
                {!client.paymentTerms ? (
                  <span className="text-xs text-muted-foreground">(org default)</span>
                ) : null}
              </div>
            </CardContent>
          </Card>
          )}

          {isDraft ? null : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <PaymentMethodsEditor
                  clientId={client.id}
                  methods={clientMethods as EditableMethod[]}
                  readOnly={!canManage}
                  emptyText="No payment methods just for this client."
                />
                <OrgPaymentMethodsPicker
                  clientId={client.id}
                  methods={orgMethods.map((m) => ({ id: m.id, name: displayPaymentMethod(m).title }))}
                  useOrg={client.useOrgPaymentMethods}
                  excluded={client.excludedOrgPaymentMethodIds}
                  readOnly={!canManage}
                />
              </div>
            </CardContent>
          </Card>
          )}

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
                            <span title="Primary contact" className="inline-flex">
                              <Star className="size-3.5 fill-brand text-brand" aria-label="Primary contact" />
                            </span>
                          ) : null}
                          {contact.receivesInvoices ? (
                            <span title="Gets invoice emails" className="inline-flex">
                              <Receipt className="size-3.5 text-muted-foreground" aria-label="Gets invoice emails" />
                            </span>
                          ) : null}
                        </div>
                        {contact.title || contact.contactRole ? (
                          <p className="text-muted-foreground">
                            {[contact.title, contact.contactRole].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-muted-foreground hover:underline"
                          >
                            {contact.email}
                          </a>
                        ) : null}
                        {contact.phone ? (
                          <p className="text-muted-foreground">{contact.phone}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <ContactDialog clientId={client.id} contact={contact} />
                        <form action={deleteContactAction.bind(null, contact.id, client.id)}>
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

          <DocumentsCard
            clientId={client.id}
            projects={client.projects.map((p) => ({ id: p.id, name: p.name }))}
            viewerId={user.id}
            {...documentsCard}
          />

          {agreementsCard.show ? (
            <AgreementsCard
              agreements={agreementsCard.agreements}
              canManage={agreementsCard.canManage}
              showProject
            />
          ) : null}

          <CredentialsCard
            clientId={client.id}
            projects={client.projects.map((p) => ({ id: p.id, name: p.name }))}
            links={vaultLinks}
            canManage={canManageVaultLinks(role)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <BookingsCard bookings={bookings} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Projects</CardTitle>
              {isDraft ? null : (
                <Button size="sm" asChild>
                  <Link href={`/projects/new?clientId=${client.id}`}>
                    <Plus className="size-3.5" /> New project
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {client.projects.length === 0 ? (
                <EmptyState
                  icon={FolderKanban}
                  title="No projects yet"
                  description={
                    isDraft
                      ? "Projects come once this draft is made a client (or its estimate is accepted and turned into a project)."
                      : "Create a project under this client to start tracking time and billing."
                  }
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

          {isDraft ? null : (
            <ClientInvoicesCard
              clientId={client.id}
              invoices={invoiceItems}
              retainerBalance={retainerBalance}
            />
          )}

          {canManage && !isDraft ? (
            <ClientCreditCard
              clientId={client.id}
              defaultCurrency={org.defaultCurrency}
              projects={client.projects.map((p) => ({
                id: p.id,
                name: p.name,
                flatFeeAmount: p.flatFeeAmount === null ? null : Number(p.flatFeeAmount),
              }))}
              openInvoices={invoices
                .filter((inv) => inv.status === "SENT" || inv.status === "PAID")
                .map((inv) => ({ id: inv.id, number: inv.number, status: inv.status, kind: inv.kind }))}
            />
          ) : null}

          {shareCard ? (
            <ClientShareLinkCard
              clientId={client.id}
              shareUrl={client.shareToken ? `${origin}/share/client/${client.shareToken}` : null}
              expiresAt={client.shareExpiresAt}
              now={shareCard.now}
              verification={shareCard.verification}
              visitors={shareCard.visitors}
            />
          ) : null}

          {canManage && !isDraft ? (
            <BookingLinkCard clientId={client.id} value={client.bookingUrl} orgDefault={org.bookingUrl} />
          ) : null}

          {canManage && !isDraft ? <BillingCycleCard
              clientId={client.id}
              cycle={billingCycleItem}
              defaultTerms={client.paymentTerms ?? org.defaultPaymentTerms}
            /> : null}

          {canManage && !isDraft ? (
            <RecurringScheduleCard clientId={client.id} schedules={recurringScheduleItems} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
