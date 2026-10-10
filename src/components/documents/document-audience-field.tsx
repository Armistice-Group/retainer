"use client";

import { Label } from "@/components/ui/label";

/** Internal only, or also listed on the client's share links. */
export function DocumentAudienceField({
  idPrefix,
  defaultValue = "INTERNAL",
}: {
  idPrefix: string;
  defaultValue?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Client can see it</legend>
      {[
        { value: "INTERNAL", label: "No — internal only", hint: "Reference docs, notes, anything not for the client." },
        { value: "CLIENT", label: "Yes — on their client links", hint: "Listed on the client's share pages. For links, they'll need access where the file lives." },
      ].map((o) => (
        <label key={o.value} htmlFor={`${idPrefix}-aud-${o.value}`} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            id={`${idPrefix}-aud-${o.value}`}
            name="audience"
            value={o.value}
            defaultChecked={defaultValue === o.value}
            className="mt-1 accent-[var(--primary)]"
          />
          <span>
            {o.label}
            <span className="block text-xs text-muted-foreground">{o.hint}</span>
          </span>
        </label>
      ))}
      <Label className="sr-only">Audience</Label>
    </fieldset>
  );
}
