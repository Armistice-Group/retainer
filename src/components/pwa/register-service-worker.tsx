"use client";

import { useEffect } from "react";

/** Registers public/sw.js (the share target and offline page). Production
 * only: in dev it would get in the way of hot reload. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Not over HTTPS (or blocked): the app works the same, minus sharing.
    });
  }, []);
  return null;
}
