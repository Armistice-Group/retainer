import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireOrgContext } from "@/lib/org-context";
import { gettingStarted } from "@/lib/services/getting-started";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GettingStartedList } from "@/components/getting-started-list";

export const metadata: Metadata = { title: "Get started" };

/** Post-setup checklist — where /setup lands the new owner: from an empty
 * organization to a first invoice, plus optional extras. Stays reachable
 * at /welcome afterwards. */
export default async function WelcomePage() {
  const { org, role } = await requireOrgContext();
  // The steps are an owner's or admin's to take.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard");

  const { steps, extras } = await gettingStarted(org);
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={`${org.name} is ready`}
        description={`Six steps to your first invoice. ${done} of ${steps.length} done.`}
      />

      <Card className="p-0">
        <CardContent className="p-0">
          <GettingStartedList steps={steps} />
        </CardContent>
      </Card>

      <Card className="mt-6 p-0">
        <CardHeader className="px-6 pt-5 pb-0">
          <CardTitle className="text-sm font-medium text-muted-foreground">Optional extras</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <GettingStartedList steps={extras} />
        </CardContent>
      </Card>

      <Button asChild className="mt-6" variant="outline">
        <Link href="/dashboard">
          Go to dashboard <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
