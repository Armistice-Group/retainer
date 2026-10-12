import "server-only";
import { prisma } from "@/lib/prisma";

export type TimeDetailEntry = {
  id: string;
  date: Date;
  startMinute: number | null;
  endMinute: number | null;
  hours: number;
  description: string | null;
  person: string;
  project: string;
  task: string | null;
  /** Only files marked for the client. */
  evidence: { id: string; fileName: string; contentType: string }[];
};

/**
 * The entries billed on an invoice, for its time detail page — or null when
 * the client hasn't turned time detail on (or nothing on it is hourly).
 */
export async function invoiceTimeDetail(invoice: {
  id: string;
  client: { invoiceTimeDetail: boolean };
}): Promise<TimeDetailEntry[] | null> {
  if (!invoice.client.invoiceTimeDetail) return null;
  const entries = await prisma.timeEntry.findMany({
    where: { invoiceLineItem: { invoiceId: invoice.id } },
    select: {
      id: true,
      date: true,
      startMinute: true,
      endMinute: true,
      hours: true,
      description: true,
      user: { select: { name: true } },
      project: { select: { name: true } },
      task: { select: { title: true } },
      attachments: {
        where: { clientVisible: true },
        select: { id: true, fileName: true, contentType: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: [{ date: "asc" }, { startMinute: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
  if (entries.length === 0) return null;
  return entries.map((e) => ({
    id: e.id,
    date: e.date,
    startMinute: e.startMinute,
    endMinute: e.endMinute,
    hours: Number(e.hours),
    description: e.description,
    person: e.user.name,
    project: e.project.name,
    task: e.task?.title ?? null,
    evidence: e.attachments,
  }));
}
