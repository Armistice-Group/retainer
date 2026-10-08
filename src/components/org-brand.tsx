import { cn } from "@/lib/utils";

/** An org's logo + name, for the sidebar / login page when it turned on
 * in-app branding. Falls back to an initial tile when there's no logo. */
export function OrgBrand({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2 font-semibold tracking-tight", className)}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded org logo, arbitrary size/type
        <img src={logoUrl} alt="" className="h-6 max-w-24 shrink-0 object-contain" />
      ) : (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-semibold text-brand-foreground">
          {name.trim().charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}
