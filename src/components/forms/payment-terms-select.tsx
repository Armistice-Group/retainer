"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_TERMS_OPTIONS } from "@/lib/payment-terms";

export const INHERIT_TERMS = "inherit";

/** Default-terms picker for a client or project. The first option falls back
 * to the level above (org for a client, client for a project). */
export function PaymentTermsSelect({
  id,
  name = "paymentTerms",
  defaultValue,
  inheritLabel,
  disabled,
}: {
  id: string;
  name?: string;
  defaultValue: string | null | undefined;
  /** e.g. "Organization default (Net 30)"; omit to require a value. */
  inheritLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      name={name}
      defaultValue={defaultValue ?? (inheritLabel ? INHERIT_TERMS : "NET30")}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {inheritLabel ? <SelectItem value={INHERIT_TERMS}>{inheritLabel}</SelectItem> : null}
        {DEFAULT_TERMS_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
