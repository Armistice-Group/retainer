import { Alert, AlertDescription } from "@/components/ui/alert";

// What the client sees after "Pay now": back from checkout (?paid=success),
// or sent back by a /pay route that couldn't start one (?paid=error&reason=…,
// a fixed code so the URL can't put arbitrary text on the page).
const PAY_ERRORS: Record<string, string> = {
  not_open: "This invoice isn't open for payment.",
  processing: "A payment for this invoice is already processing.",
};

export const PROCESSING_NOTE =
  "It can take a few business days to clear, and the invoice will show as paid once it does.";

/** A bank (ACH) payment was made through "Pay now" and is still clearing. */
export function isPaymentProcessing(invoice: { status: string; stripePaymentIntentId: string | null }) {
  return invoice.status === "SENT" && !!invoice.stripePaymentIntentId;
}

export function PaymentReturnBanner({
  paid,
  reason,
  invoice,
  orgName,
  hasPaymentMethods,
}: {
  paid?: string;
  reason?: string;
  /** The invoice paid for, if known. `number` names it on pages listing several. */
  invoice: { number?: string; status: string; processing: boolean } | null;
  orgName: string;
  hasPaymentMethods: boolean;
}) {
  const which = invoice?.number ? `Invoice ${invoice.number}: ` : "";
  if (paid === "success") {
    const text = invoice?.processing
      ? `Thanks — your bank payment is processing. ${PROCESSING_NOTE}`
      : invoice?.status === "PAID"
        ? "Thanks — payment received."
        : "Thanks — payment received. It may take a moment to show as paid.";
    return (
      <Alert>
        <AlertDescription>
          {which}
          {text}
        </AlertDescription>
      </Alert>
    );
  }
  if (paid === "error" && invoice?.status !== "PAID") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {which}
          {PAY_ERRORS[reason ?? ""] ??
            `Online payment isn't available for this invoice right now. ${hasPaymentMethods ? "Use one of the ways to pay below, or contact" : "Contact"} ${orgName}.`}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}
