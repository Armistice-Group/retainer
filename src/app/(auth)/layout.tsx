import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-1">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          <span className="text-primary">Consultainer</span>
        </Link>
        <p className="text-sm text-muted-foreground">
          Clients, projects, time, and invoices — in one place.
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
