import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL || "http://localhost:3000"),
  title: { default: "Consultainer", template: "%s — Consultainer" },
  description: "Run client engagements — tasks, time, and invoices — from your AI coding agent and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Consultainer",
    description: "Run client engagements — tasks, time, and invoices — from your AI coding agent and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Consultainer",
    description: "Run client engagements — tasks, time, and invoices — from your AI coding agent and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
  },
};

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
        <Script
          src="https://app.rybbit.io/api/script.js"
          data-site-id="43e29c61736f"
          strategy="afterInteractive"
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
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
