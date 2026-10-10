// Invoice money math shared by server code, client components and the PDF.
// Everything is done in whole cents so 0.1 + 0.2 never leaves a stray
// fraction of a cent "still due".

type Numeric = number | string | { toString(): string };

export function toCents(amount: Numeric) {
  return Math.round(Number(amount.toString()) * 100);
}

export type InvoiceAmounts = {
  total: Numeric;
  amountPaid: Numeric;
  creditApplied: Numeric;
};

/** What's still owed: total − payments − applied credit. Negative when
 * overpaid (the excess is client credit). */
export function balanceCents(invoice: InvoiceAmounts) {
  return toCents(invoice.total) - toCents(invoice.amountPaid) - toCents(invoice.creditApplied);
}

/** Balance due in currency units, never below zero. */
export function balanceDue(invoice: InvoiceAmounts) {
  return Math.max(0, balanceCents(invoice)) / 100;
}

/** Payments plus applied credit, in currency units. */
export function amountSettled(invoice: Pick<InvoiceAmounts, "amountPaid" | "creditApplied">) {
  return (toCents(invoice.amountPaid) + toCents(invoice.creditApplied)) / 100;
}

/** A sent invoice with some, but not all, of its total paid or credited. */
export function isPartlyPaid(invoice: InvoiceAmounts & { status: string }) {
  return (
    invoice.status === "SENT" &&
    toCents(invoice.amountPaid) + toCents(invoice.creditApplied) > 0 &&
    balanceCents(invoice) > 0
  );
}

/** What a status should say about money: "Partly paid · $X due" for a
 * partly paid invoice, else null (show the plain status). */
export function partlyPaidLabel(invoice: InvoiceAmounts & { status: string; currency: string }) {
  if (!isPartlyPaid(invoice)) return null;
  const due = new Intl.NumberFormat("en-US", { style: "currency", currency: invoice.currency }).format(
    balanceDue(invoice)
  );
  return `Partly paid · ${due} due`;
}

/** How much of these invoice lines has been paid: each line's share of
 * what's been settled (payments plus credit) on its invoice. */
export function paidShare(
  lines: { amount: Numeric; invoice: InvoiceAmounts }[]
) {
  let cents = 0;
  for (const line of lines) {
    const total = toCents(line.invoice.total);
    if (total <= 0) continue;
    const settled = Math.min(total, toCents(line.invoice.amountPaid) + toCents(line.invoice.creditApplied));
    cents += Math.round((toCents(line.amount) * settled) / total);
  }
  return cents / 100;
}
