import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";

// Where requireOrgContext() sends a request whose session cookie no longer
// checks out (password reset, deleted account). Clearing the cookie needs a
// Route Handler — and has to happen here, or the proxy (which can't see the
// database) would keep bouncing /login back to /dashboard. A session that is
// still valid is left alone, so a link to this URL can't sign anyone out.
export async function GET() {
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  await signOut({ redirectTo: "/login?error=session-ended" });
}
