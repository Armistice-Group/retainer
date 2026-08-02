import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Mail,
  Phone,
  MapPin,
  Pencil,
  Star,
  Trash2,
  Plus,
  FolderKanban,
  Receipt,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { LinkList } from "@/components/link-list";
import { AddLinkDialog } from "@/components/forms/add-link-dialog";
import { ContactDialog } from "./contact-dialog";
import { deleteClientAction, deleteContactAction } from "@/actions/clients";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { EmptyState } from "@/components/empty-state";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { org } = await requireOrgContext();

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      links: { orderBy: { createdAt: "asc" } },
      projects: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!client || client.orgId !== org.id) notFound();

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
              {!client.description && !client.email && !client.phone && !client.address ? (
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
        </div>

        <div className="lg:col-span-2">
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
                        <span className="font-medium">{project.name}</span>
                        <StatusBadge status={project.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
