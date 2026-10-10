import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiRequest, forbidden, unauthorized } from "@/lib/api-auth";
import { invoiceVisibilityWhere } from "@/lib/project-access";
import {
  canManagePayments,
  invoiceLedger,
  invoiceMoneyFields,
  PaymentError,
  recordPayment,
} from "@/lib/services/payments";

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  receivedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-mm-dd")
    .optional(),
  method: z.string().trim().max(100).optional(),
  reference: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
});

/** Payments on an invoice, credit applied to it, and its balance. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId: ctx.orgId, ...invoiceVisibilityWhere(ctx.actorId, ctx.role) },
  });
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });

  const ledger = await invoiceLedger(id);
  return Response.json({
    ...invoiceMoneyFields(invoice),
    payments: ledger.payments.map(({ recordedBy, ...p }) => ({ ...p, recordedBy: recordedBy?.name ?? null })),
    creditApplications: ledger.credits.map(({ appliedBy, ...c }) => ({ ...c, appliedBy: appliedBy?.name ?? null })),
    creditNotes: ledger.creditNotes,
  });
}

/** Records a payment (owner/admin keys only). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  if (!canManagePayments(ctx.role)) return forbidden("Only owners and admins can record payments.");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { id, orgId: ctx.orgId, ...invoiceVisibilityWhere(ctx.actorId, ctx.role) },
  });
  if (!invoice) return Response.json({ error: "Invoice not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = recordPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const result = await recordPayment({ orgId: ctx.orgId, actorId: ctx.actorId }, { invoiceId: id, ...parsed.data });
    return Response.json(
      { payment: result.payment, invoice: { ...result.invoice, ...invoiceMoneyFields(result.invoice) } },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof PaymentError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
