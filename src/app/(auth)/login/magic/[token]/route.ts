import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

// A Route Handler, not a page — signIn() needs to set the session cookie,
// and cookies() can only be written from a Server Action or Route Handler,
// never a plain Server Component.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    await signIn("magic-link", { token, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof AuthError) {
      redirect("/login?error=invalid-magic-link");
    }
    throw err;
  }
}
