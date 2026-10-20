"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setInvoiceTimeDetailAction } from "@/actions/invoices";

/** Whether this invoice carries its timesheet: a page on the PDF (and the
 * client link) listing each entry. Starts from the client's setting. */
export function TimesheetToggle({
  invoiceId,
  included,
  clientDefault,
  disabled,
}: {
  invoiceId: string;
  included: boolean;
  clientDefault: boolean;
  disabled?: boolean;
}) {
  const [checked, setChecked] = useState(included);
  const [pending, startTransition] = useTransition();
  return (
    <label className="mt-3 flex items-start gap-2 border-t border-border pt-3 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled || pending}
        className="mt-0.5"
        onCheckedChange={(v) => {
          const next = v === true;
          setChecked(next);
          startTransition(async () => {
            const r = await setInvoiceTimeDetailAction(invoiceId, next);
            if (r?.error) {
              setChecked(!next);
              toast.error(r.error);
            } else {
              toast.success(next ? "The timesheet is on this invoice." : "The timesheet is off this invoice.");
            }
          });
        }}
      />
      <span>
        Include the timesheet
        <span className="block text-xs text-muted-foreground">
          A page on the PDF and the client link with each entry&apos;s date, times, hours and
          description. This client&apos;s default: {clientDefault ? "on" : "off"}.
        </span>
      </span>
    </label>
  );
}
