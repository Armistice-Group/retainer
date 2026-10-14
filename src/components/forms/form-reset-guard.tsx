"use client";

import { useEffect } from "react";

/**
 * React 19 resets a <form action={…}> after its action runs. That empties
 * fields the person typed when the server refuses them, and snaps Radix
 * selects and checkboxes back to the values the page loaded with (so the
 * next save writes the old value back). This cancels those resets app-wide.
 * A form that should clear (a comment box, a secret) opts in with
 * data-allow-reset.
 */
export function FormResetGuard() {
  useEffect(() => {
    function onReset(e: Event) {
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || "allowReset" in form.dataset) return;
      e.preventDefault();
      // Capturing at the window stops the event before it reaches the
      // form's own listeners (Radix resets its controls on them).
      e.stopPropagation();
    }
    window.addEventListener("reset", onReset, true);
    return () => window.removeEventListener("reset", onReset, true);
  }, []);
  return null;
}
