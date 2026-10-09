"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { setClientOrgPaymentMethodsAction } from "@/actions/payment-methods";

/** Which of the organization's payment methods this client is offered too. */
export function OrgPaymentMethodsPicker({
  clientId,
  methods,
  useOrg,
  excluded,
  readOnly,
}: {
  clientId: string;
  methods: { id: string; name: string }[];
  useOrg: boolean;
  excluded: string[];
  readOnly: boolean;
}) {
  const [on, setOn] = useState(useOrg);
  const [off, setOff] = useState(new Set(excluded));
  const [pending, startTransition] = useTransition();

  function save(nextOn: boolean, nextOff: Set<string>) {
    setOn(nextOn);
    setOff(nextOff);
    startTransition(() => setClientOrgPaymentMethodsAction(clientId, nextOn, [...nextOff]));
  }

  if (methods.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Organization-wide methods added under Settings → Payments can be offered here too.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`org-methods-${clientId}`}
          checked={on}
          disabled={readOnly || pending}
          onCheckedChange={(v) => save(v === true, off)}
        />
        <Label htmlFor={`org-methods-${clientId}`} className="font-normal">
          Also offer the organization&apos;s payment methods
        </Label>
      </div>
      {on ? (
        <ul className="ml-6 flex flex-col gap-1.5">
          {methods.map((m) => {
            const id = `org-method-${m.id}`;
            return (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={!off.has(m.id)}
                  disabled={readOnly || pending}
                  onCheckedChange={(v) => {
                    const next = new Set(off);
                    if (v === true) next.delete(m.id);
                    else next.add(m.id);
                    save(on, next);
                  }}
                />
                <Label htmlFor={id} className="font-normal text-muted-foreground">
                  {m.name}
                </Label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
