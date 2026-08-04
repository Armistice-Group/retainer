import { authenticateApiRequest, unauthorized, forbidden } from "@/lib/api-auth";
import { generateInvoiceSchema } from "@/lib/validations/invoice";
import { generateInvoice, InvoiceError } from "@/lib/services/invoices";

export async function POST(req: Request) {
  const ctx = await authenticateApiRequest(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    return forbidden("Only owners and admins can generate invoices.");
  }

  const body = await req.json().catch(() => null);
  const parsed = generateInvoiceSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 422 });
  }

  try {
    const invoice = await generateInvoice(
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
