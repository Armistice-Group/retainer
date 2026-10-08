import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { iconVersion } from "@/lib/branding";
import { getOrigin } from "@/lib/url";

// Site-wide type pairing — a deliberate departure from Next.js's own Geist
// defaults. JetBrains Mono in particular isn't just a generic "techy" pick:
// it's the actual monospace font a lot of engineers already read all day in
// their editor, and it's used throughout for anything that's data or a
// system label (rates, hours, totals, nav, badges) rather than prose.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  // Tab / home-screen icons follow the org's branding when it's turned on
  // (see /api/branding/icon); the version busts browser icon caches.
  const [v, origin] = await Promise.all([iconVersion(), getOrigin().catch(() => null)]);
  return {
    // Absolute base for icon / link-preview URLs — the instance's public URL,
    // never a hardcoded localhost.
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    title: { default: "Consultainer", template: "%s — Consultainer" },
    description: "Clients, projects, time, and invoices for engineering consultancies.",
    robots: { index: false, follow: false },
    icons: {
      icon: `/api/branding/icon?v=${v}`,
      apple: `/api/branding/icon?kind=apple&v=${v}`,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
