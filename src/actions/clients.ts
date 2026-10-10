"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOrgContext, requireRole } from "@/lib/org-context";
import { clientSchema, contactSchema, linkSchema } from "@/lib/validations/client";
import type { ActionState } from "@/actions/auth";

export async function createClientAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    description: formData.get("description"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    billingEmail: formData.get("billingEmail"),
    billingAddress: formData.get("billingAddress"),
    paymentTerms: formData.get("paymentTerms") ?? undefined,
    invoiceReminders: formData.get("invoiceReminders") === "on",
    status: formData.get("status") || "ACTIVE",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (parsed.data.status === "LEAD") {
    return { error: "Draft clients come from Cal.com and Calendly bookings. Pick Active or Inactive." };
  }

  const client = await prisma.client.create({
    data: {
      orgId: org.id,
      name: parsed.data.name,
      website: parsed.data.website || null,
      description: parsed.data.description || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      billingEmail: parsed.data.billingEmail || null,
      billingAddress: parsed.data.billingAddress || null,
      paymentTerms: parsed.data.paymentTerms,
      invoiceReminders: parsed.data.invoiceReminders,
      status: parsed.data.status,
    },
  });

  revalidatePath("/clients");
  redirect(`/clients/${client.id}?new=1`);
}

export async function updateClientAction(
  clientId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org, role } = await requireOrgContext();

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    website: formData.get("website"),
    description: formData.get("description"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    billingEmail: formData.get("billingEmail"),
    billingAddress: formData.get("billingAddress"),
    paymentTerms: formData.get("paymentTerms") ?? undefined,
    invoiceReminders: formData.get("invoiceReminders") === "on",
    status: formData.get("status") || "ACTIVE",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const current = await prisma.client.findFirst({ where: { id: clientId, orgId: org.id }, select: { status: true } });
  if (!current) return { error: "Client not found." };
  if (parsed.data.status === "LEAD" && current.status !== "LEAD") {
    return { error: "A client can't be turned back into a draft." };
  }
  if (current.status === "LEAD" && parsed.data.status !== "LEAD" && role !== "OWNER" && role !== "ADMIN") {
    return { error: "Only owners and admins can make a draft client a client." };
  }

  await prisma.client.update({
    where: { id: clientId, orgId: org.id },
    data: {
      name: parsed.data.name,
      website: parsed.data.website || null,
      description: parsed.data.description || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      billingEmail: parsed.data.billingEmail || null,
      billingAddress: parsed.data.billingAddress || null,
      paymentTerms: parsed.data.paymentTerms,
      invoiceReminders: parsed.data.invoiceReminders,
      status: parsed.data.status,
      ...(current.status === "LEAD" && parsed.data.status !== "LEAD" ? { leadDiscardedAt: null } : {}),
    },
  });

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  return null;
}

export async function deleteClientAction(clientId: string) {
  const { org, role } = await requireOrgContext();
  requireRole(role, ["OWNER", "ADMIN"]);
  await prisma.client.delete({ where: { id: clientId, orgId: org.id } });
  revalidatePath("/clients");
  redirect("/clients");
}

export async function createContactAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = contactSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    title: formData.get("title"),
    contactRole: formData.get("contactRole"),
    isPrimary: formData.get("isPrimary") === "on",
    receivesInvoices: formData.get("receivesInvoices") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  if (parsed.data.isPrimary) {
    await prisma.contact.updateMany({
      where: { clientId: parsed.data.clientId },
      data: { isPrimary: false },
    });
  }

  await prisma.contact.create({
    data: {
      clientId: parsed.data.clientId,
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      title: parsed.data.title || null,
      contactRole: parsed.data.contactRole || null,
      isPrimary: parsed.data.isPrimary,
      receivesInvoices: parsed.data.receivesInvoices,
    },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return null;
}

export async function updateContactAction(
  contactId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = contactSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    title: formData.get("title"),
    contactRole: formData.get("contactRole"),
    isPrimary: formData.get("isPrimary") === "on",
    receivesInvoices: formData.get("receivesInvoices") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
  if (!client || client.orgId !== org.id) return { error: "Client not found." };

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact || contact.clientId !== parsed.data.clientId) {
    return { error: "Contact not found." };
  }

  if (parsed.data.isPrimary) {
    await prisma.contact.updateMany({
      where: { clientId: parsed.data.clientId, id: { not: contactId } },
      data: { isPrimary: false },
    });
  }

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      name: parsed.data.name,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      title: parsed.data.title || null,
      contactRole: parsed.data.contactRole || null,
      isPrimary: parsed.data.isPrimary,
      receivesInvoices: parsed.data.receivesInvoices,
    },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return null;
}

export async function deleteContactAction(contactId: string, clientId: string) {
  const { org } = await requireOrgContext();
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client || client.orgId !== org.id) throw new Error("Client not found.");

  const { count } = await prisma.contact.deleteMany({ where: { id: contactId, clientId } });
  if (count === 0) throw new Error("Contact not found.");
  revalidatePath(`/clients/${clientId}`);
}

export async function createLinkAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { org } = await requireOrgContext();

  const parsed = linkSchema.safeParse({
    clientId: formData.get("clientId") || undefined,
    projectId: formData.get("projectId") || undefined,
    label: formData.get("label"),
    url: formData.get("url"),
    type: formData.get("type") || "OTHER",
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }
  if (!parsed.data.clientId && !parsed.data.projectId) {
    return { error: "Link must belong to a client or project." };
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findUnique({ where: { id: parsed.data.clientId } });
    if (!client || client.orgId !== org.id) return { error: "Client not found." };
  }
  if (parsed.data.projectId) {
    const project = await prisma.project.findUnique({ where: { id: parsed.data.projectId } });
    if (!project || project.orgId !== org.id) return { error: "Project not found." };
  }

  await prisma.link.create({
    data: {
      clientId: parsed.data.clientId || null,
      projectId: parsed.data.projectId || null,
      label: parsed.data.label,
      url: parsed.data.url,
      type: parsed.data.type,
    },
  });

  if (parsed.data.clientId) revalidatePath(`/clients/${parsed.data.clientId}`);
  if (parsed.data.projectId) revalidatePath(`/projects/${parsed.data.projectId}`);
  return null;
}

export async function deleteLinkAction(linkId: string, redirectPath: string) {
  const { org } = await requireOrgContext();
  const link = await prisma.link.findUnique({
    where: { id: linkId },
    include: { client: true, project: true },
  });
  if (!link) return;
  const owningOrgId = link.client?.orgId ?? link.project?.orgId;
  if (owningOrgId !== org.id) throw new Error("Link not found.");

  await prisma.link.delete({ where: { id: linkId } });
  revalidatePath(redirectPath);
}
