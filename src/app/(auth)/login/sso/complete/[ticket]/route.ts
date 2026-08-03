import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

// A Route Handler, not a page — signIn() needs to set the session cookie,
// and cookies() can only be written from a Server Action or Route Handler,
// never a plain Server Component.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticket: string }> }
) {
  const { ticket } = await params;

  try {
    await signIn("sso", { ticket, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=sso-failed");
    }
    throw err;
  }
}
