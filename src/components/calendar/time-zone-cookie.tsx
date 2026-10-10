"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Tells the server the browser's time zone (a "tz" cookie), so timed items
 * like meetings land on the right day. Refreshes once if it changed. */
export function TimeZoneCookie({ current }: { current: string | null }) {
  const router = useRouter();
  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!tz || tz === current) return;
    document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [current, router]);
  return null;
}
