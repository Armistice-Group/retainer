import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AUTH_URL || "http://localhost:3000"),
  title: { default: "Consultainer", template: "%s — Consultainer" },
  description: "Run client engagements — tasks, time, and invoices — from Claude Code and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Consultainer",
    description: "Run client engagements — tasks, time, and invoices — from Claude Code and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Consultainer",
    description: "Run client engagements — tasks, time, and invoices — from Claude Code and Linear, not a separate admin app. Built for engineering consultancies: software, security, and design.",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
