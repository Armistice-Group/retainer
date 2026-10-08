import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { isEmailConfigured } from "@/lib/email";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Step = { done: boolean; title: string; description: string; href: string; cta: string };

/** Post-setup checklist — where /setup lands the new admin. Every step is
 * optional; it stays reachable at /welcome afterwards. */
export default async function WelcomePage() {
  const { org } = await requireOrgContext();

  const [sso, memberCount, inviteCount, clientCount] = await Promise.all([
    prisma.ssoConnection.findUnique({ where: { orgId: org.id }, select: { enabled: true } }),
    prisma.membership.count({ where: { orgId: org.id } }),
    prisma.invite.count({ where: { orgId: org.id, usedAt: null } }),
    prisma.client.count({ where: { orgId: org.id } }),
  ]);
  const emailEnabled = await isEmailConfigured();

  const steps: Step[] = [
    {
      done: !!sso?.enabled,
      title: "Connect single sign-on",
      description:
        "Let your team sign in through Okta, Entra ID, Google Workspace, Authentik, Keycloak, or any OIDC provider.",
      href: "/settings/security",
      cta: sso ? "Manage SSO" : "Set up SSO",
    },
    {
      done: memberCount > 1 || inviteCount > 0,
      title: "Invite your team",
      description: emailEnabled
        ? "Invites are emailed, and you can also copy the link to share directly."
        : "Email isn't configured, so you'll get an invite link to share directly. With SSO auto-provisioning on, teammates can just sign in instead.",
      href: "/settings/members",
      cta: "Invite people",
    },
    {
      done: clientCount > 0,
      title: "Add your first client",
      description: "Or import clients and projects from a CSV.",
      href: "/clients/new",
      cta: "Add client",
    },
    {
      done: false,
      title: "Connect integrations",
      description: "QuickBooks, Linear, Mercury, and Stripe — all optional.",
      href: "/settings/integrations",
      cta: "View integrations",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader
        title={`${org.name} is ready`}
        description="You're signed in as the local admin. A few optional next steps:"
      />

      <Card>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {steps.map((step) => (
            <div key={step.title} className="flex items-start gap-3 px-6 py-4">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-chart-3" />
              ) : (
                <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href={step.href}>{step.cta}</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Button asChild className="mt-6">
        <Link href="/dashboard">
          Go to dashboard <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </div>
  );
}
