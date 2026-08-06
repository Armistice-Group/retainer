"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "cookie-notice-dismissed";
const CHANGE_EVENT = "cookie-notice-change";

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

function getSnapshot() {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

// The server has no localStorage — assume dismissed so nothing renders
// until the client re-syncs against the real value right after hydration.
function getServerSnapshot() {
  return true;
}

export function CookieNotice() {
  const dismissed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, "1");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  if (dismissed) return null;

  return (
    <>
      {/* Reserves the fixed bar's height in normal flow so it never overlaps
          content sitting at the bottom of the page (e.g. the footer). */}
      <div aria-hidden className="h-20 sm:h-16" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 px-6 py-3 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:gap-3 sm:py-4 sm:text-sm">
          <p>
            We use a strictly-necessary cookie to keep you signed in, and privacy-focused
            analytics to see which pages get used.{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
          <Button size="sm" onClick={dismiss} className="shrink-0">
            Got it
          </Button>
        </div>
      </div>
    </>
  );
}
