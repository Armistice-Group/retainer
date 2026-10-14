import "server-only";
import { prisma } from "@/lib/prisma";

export type GettingStartedStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
};

/**
 * The path from an empty organization to a first invoice, ticked off from
 * what's actually there. `extras` are optional (team, SSO, integrations).
 */
export async function gettingStarted(org: {
  id: string;
  businessAddress: string | null;
  logoData: Uint8Array | null;
  logoUrl: string | null;
  slackWebhookUrl: string | null;
}) {
  const [paymentMethods, clients, projects, entries, invoices, members, invites, sso, quickbooks, linear] =
    await Promise.all([
      prisma.paymentMethod.count({ where: { orgId: org.id, clientId: null } }),
      prisma.client.count({ where: { orgId: org.id, status: { not: "LEAD" } } }),
      prisma.project.count({ where: { orgId: org.id } }),
      prisma.timeEntry.count({ where: { orgId: org.id } }),
      prisma.invoice.count({ where: { orgId: org.id } }),
      prisma.membership.count({ where: { orgId: org.id } }),
      prisma.invite.count({ where: { orgId: org.id, usedAt: null } }),
      prisma.ssoConnection.findUnique({ where: { orgId: org.id }, select: { enabled: true } }),
      prisma.quickBooksConnection.findUnique({ where: { orgId: org.id }, select: { id: true } }),
      prisma.linearConnection.findUnique({ where: { orgId: org.id }, select: { id: true } }),
    ]);

  const steps: GettingStartedStep[] = [
    {
      key: "business",
      title: "Add your business details",
      description: "Your address, tax ID and logo go on every invoice.",
      href: "/settings",
      cta: "Open settings",
      done: !!org.businessAddress || !!org.logoData || !!org.logoUrl,
    },
    {
      key: "payment",
      title: "Say how clients can pay you",
      description: "Bank transfer, a payment link, checks: shown on invoices.",
      href: "/settings/payments#payment-methods",
      cta: "Add a payment method",
      done: paymentMethods > 0,
    },
    {
      key: "client",
      title: "Add a client",
      description: "Or import clients and projects from a CSV.",
      href: "/clients/new",
      cta: "Add client",
      done: clients > 0,
    },
    {
      key: "project",
      title: "Start a project",
      description: "Hourly, flat fee or milestones, with your rate.",
      href: "/projects/new",
      cta: "New project",
      done: projects > 0,
    },
    {
      key: "time",
      title: "Log some time",
      description: "By hand, or start the timer at the top of the page.",
      href: "/time?log=1",
      cta: "Log time",
      done: entries > 0,
    },
    {
      key: "invoice",
      title: "Create your first invoice",
      description: "Turn unbilled time into an invoice and send the client its link.",
      href: "/invoices/new",
      cta: "New invoice",
      done: invoices > 0,
    },
  ];

  const extras: GettingStartedStep[] = [
    {
      key: "team",
      title: "Invite your team",
      description: "Optional. Teammates log time and see the projects you put them on.",
      href: "/settings/members?invite=1",
      cta: "Invite people",
      done: members > 1 || invites > 0,
    },
    {
      key: "integrations",
      title: "Connect QuickBooks, Linear or Slack",
      description: "Optional. Sync invoices, pull in tasks, get alerts.",
      href: "/settings/integrations",
      cta: "View integrations",
      done: !!quickbooks || !!linear || !!org.slackWebhookUrl,
    },
    {
      key: "sso",
      title: "Set up single sign-on",
      description: "Optional, for teams on Okta, Entra ID, Google Workspace or another OIDC provider.",
      href: "/settings/security",
      cta: sso ? "Manage SSO" : "Set up SSO",
      done: !!sso?.enabled,
    },
  ];

  return { steps, extras, done: steps.every((s) => s.done) };
}
