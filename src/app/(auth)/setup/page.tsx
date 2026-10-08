import { redirect } from "next/navigation";
import { isSetupComplete, isSetupTokenRequired } from "@/lib/setup";
import { getRequestOrigin } from "@/lib/url";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isSetupComplete()) redirect("/login");
  return (
    <SetupForm
      tokenRequired={isSetupTokenRequired()}
      // AUTH_URL, when set, already fixes the public URL — nothing to confirm.
      detectedUrl={process.env.AUTH_URL ? null : await getRequestOrigin()}
    />
  );
}
