import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isSetupComplete } from "@/lib/setup";

export default async function Home() {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
