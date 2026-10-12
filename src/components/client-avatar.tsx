import { cn } from "@/lib/utils";

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** A client's logo, or their initials when there isn't one. */
export function ClientAvatar({
  name,
  src,
  className,
}: {
  name: string;
  /** clientLogoUrl(client), or a data: URI outside the app. */
  src: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40 text-xs font-medium text-muted-foreground",
        src && "bg-white",
        className
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded/fetched image served by our own route
        <img src={src} alt="" className="size-full object-contain p-0.5" />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
}
