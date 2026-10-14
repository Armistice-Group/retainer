import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown instead of a page only owners and admins can open. */
export function AdminOnlyNotice({ what = "this page" }: { what?: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Lock className="size-4 text-muted-foreground" />
      </span>
      <h1 className="text-lg font-semibold">Only owners and admins can see {what}</h1>
      <p className="text-sm text-muted-foreground">
        Ask an owner or admin in your organization if you need access.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
