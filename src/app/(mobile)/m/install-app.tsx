"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISSED_KEY = "pwa:installDismissed";

/** "Install on this phone": shown when Chrome says the app can be
 * installed and it isn't already running installed. */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // No storage: ask every time.
    }
    if (dismissed || window.matchMedia("(display-mode: standalone)").matches) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Download className="size-5 shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-sm">
        Install on this phone for the home screen and the share sheet.
      </p>
      <Button
        size="sm"
        onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice;
          setPrompt(null);
        }}
      >
        Install
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        aria-label="Not now"
        onClick={() => {
          try {
            localStorage.setItem(DISMISSED_KEY, "1");
          } catch {
            // Hidden for this visit anyway.
          }
          setPrompt(null);
        }}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
