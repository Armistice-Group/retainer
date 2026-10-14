"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";

const COOKIE = "flash";

/** Shows a message a server action left with flash() before redirecting. */
export function FlashToaster() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
    if (!match) return;
    document.cookie = `${COOKIE}=; path=/; max-age=0; samesite=lax`;
    try {
      toast.success(decodeURIComponent(match[1]));
    } catch {
      // A mangled cookie isn't worth an error.
    }
  }, [pathname, searchParams]);
  return null;
}
