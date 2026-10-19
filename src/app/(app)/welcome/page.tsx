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
import { EmailSettings } from "../settings/email-settings";
import { emailStatus } from "@/lib/email";
import { describeIntegration } from "@/lib/instance-config";

export const metadata: Metadata = { title: "Get started" };

/** Post-setup checklist — where /setup lands the new owner: from an empty
 * organization to a first invoice, plus optional extras. Stays reachable
 * at /welcome afterwards. */
export default async function WelcomePage() {
  const { org, role, user } = await requireOrgContext();
  // The steps are an owner's or admin's to take.
  if (role !== "OWNER" && role !== "ADMIN") redirect("/dashboard");

  const { steps, extras } = await gettingStarted(org);
  const done = steps.filter((s) => s.done).length;
  // Email is the one step done right here: without it nothing reaches
  // clients. It's instance-wide, so only owners set it up. The card stays
  // once it's done, so the test send is right there after saving.
  const email = await emailStatus();
  const showEmail = role === "OWNER";

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={`${org.name} is ready`}
        description={`${steps.length} steps to your first invoice. ${done} of ${steps.length} done.`}
      />

      {showEmail ? (
        <Card className="mb-6" id="email">
          <CardHeader>
            <CardTitle className="text-base">
              {email.configured ? `Email is set up (${email.provider === "smtp" ? "SMTP" : "Resend"})` : "First, set up email"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {email.configured
                ? `Invoices, reminders, invites and login links are sent as ${email.from}.`
                : "Invoices, payment reminders, invites and login links are sent by email. Skip it for now and you'll copy links to send yourself; it's under Settings → Integrations any time."}
            </p>
          </CardHeader>
          <CardContent>
            <EmailSettings
              fields={await describeIntegration("email")}
              provider={email.provider}
              configured={email.configured}
              canEdit
              userEmail={user.email ?? null}
            />
          </CardContent>
        </Card>
      ) : null}

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
