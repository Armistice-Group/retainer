"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

/** The sidebar, as a slide-out panel on narrow screens. */
export function MobileNav({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Open on the page it was opened on: following a link closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (next: boolean) => setOpenOn(next ? pathname : null);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="-ml-2 size-9 md:hidden"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="bg-sidebar p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          {children}
        </SheetContent>
      </Sheet>
    </>
  );
}
