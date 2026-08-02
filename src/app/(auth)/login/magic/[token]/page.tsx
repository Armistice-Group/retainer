import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export default async function MagicLinkLoginPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
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
