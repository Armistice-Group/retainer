import { z } from "zod";
import { authenticateApiRequest, unauthorized, forbidden } from "@/lib/api-auth";
import { paymentTermsValues } from "@/lib/validations/invoice";
import { createCustomInvoice, InvoiceError } from "@/lib/services/invoices";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date, e.g. 2026-07-23.");

const customInvoiceSchema = z.object({
  clientId: z.string().min(1),
  lines: z
    .array(z.object({ description: z.string().trim().min(1).max(500), amount: z.number().positive() }))
    .min(1)
    .max(100),
  deposit: z.boolean().default(false),
  projectId: z.string().optional(),
  issueDate: isoDate,
  dueDate: isoDate.optional(),
  paymentTerms: z.enum(paymentTermsValues).optional(),
  poNumber: z.string().trim().max(100).optional(),
  taxRate: z.number().min(0).max(100).default(0),
  notes: z.string().trim().max(2000).optional(),
});

/** A draft invoice for amounts you name (a set fee, a deposit), not logged work. */
export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return forbidden("Only owners and admins can create invoices.");
  }

  const body = await req.json().catch(() => null);
  const parsed = customInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const invoice = await createCustomInvoice(
      { orgId: ctx.orgId, defaultCurrency: ctx.defaultCurrency, actorId: ctx.actorId, role: ctx.role },
      parsed.data
    );
    return Response.json({ invoice }, { status: 201 });
  } catch (err) {
    if (err instanceof InvoiceError) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
