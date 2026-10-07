import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/setup";

// Checks the database on every request — must never be prerendered at build
// time, when there's no database to reach.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
