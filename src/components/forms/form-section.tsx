import Link from "next/link";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One group of related fields: title + explanation on the left, fields on
 * the right (stacked on small screens). Sections are separated by a hairline
 * rule rather than each sitting in its own card. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-b border-border py-7 first:pt-0 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  wide,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string[];
  /** Span both columns of the section's field grid. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error?.[0] ? (
        <p className="text-sm text-destructive">{error[0]}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/** Right-aligned Cancel / submit row closing a sectioned form. */
export function FormActions({
  cancelHref,
  children,
}: {
  cancelHref?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-end gap-2 pt-6">
      {cancelHref ? (
        <Button asChild variant="ghost">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      ) : null}
      {children}
    </div>
  );
}
