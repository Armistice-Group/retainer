import type { DisplayMethod } from "@/lib/payment-methods";

/** Read-only payment methods, as clients see them on share pages. */
export function PaymentMethodsList({ methods }: { methods: DisplayMethod[] }) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {methods.map((m) => (
        <div key={m.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <p className="text-sm font-medium">{m.title}</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
            {m.lines.map((line, i) => (
              <div key={i} className="contents">
                {line.label ? <dt className="text-muted-foreground">{line.label}</dt> : null}
                <dd
                  className={
                    line.label
                      ? "break-all whitespace-pre-line"
                      : "col-span-2 whitespace-pre-line text-muted-foreground"
                  }
                >
                  {line.url ? (
                    <a
                      href={line.value}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand hover:underline"
                    >
                      {line.value}
                    </a>
                  ) : (
                    line.value
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
