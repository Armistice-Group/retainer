import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export default async function SsoCompletePage({
  params,
}: {
  params: Promise<{ ticket: string }>;
}) {
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
