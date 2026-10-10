import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "./invite-dialog";
import { MemberRowActions } from "./member-row-actions";
import { CostRateField } from "./cost-rate-field";
import { CopyButton } from "@/components/copy-button";
import { revokeInviteAction } from "@/actions/org";
import { X } from "lucide-react";
import { getOrigin } from "@/lib/url";
import { formatCurrency } from "@/lib/format";
import Link from "next/link";

export default async function MembersPage() {
  const { org, role, user } = await requireOrgContext();
  const canManage = role === "OWNER" || role === "ADMIN";

  const [memberships, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { orgId: org.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    }),
    canManage
      ? prisma.invite.findMany({
          where: { orgId: org.id, usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const origin = await getOrigin();
  // With SSO enforced, everyone but owners signs in through the identity
  // provider — exempt from required 2FA, and no local password to reset.
  const sso = await prisma.ssoConnection.findUnique({
    where: { orgId: org.id },
    select: { enabled: true, enforced: true },
  });
  const ssoOnly = (memberRole: string) => !!sso?.enabled && sso.enforced && memberRole !== "OWNER";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Members</CardTitle>
          {canManage ? <InviteDialog /> : null}
        </CardHeader>
        <CardContent>
          {canManage ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Rate is what someone bills per hour by default — it&apos;s filled in when they&apos;re
              added to a project, and changing it doesn&apos;t touch projects they&apos;re already on.
              Blank uses the{" "}
              <Link href="/settings" className="text-brand hover:underline">
                organization default
              </Link>
              {org.defaultBillRate != null
                ? ` (${formatCurrency(org.defaultBillRate, org.defaultCurrency)}/h)`
                : ` (not set, so ${formatCurrency(0, org.defaultCurrency)})`}
              . Cost is what an hour of their time costs you (salary or contractor rate), used for
              profit on Reports. Only owners and admins see either. Use the ⋯ menu to change a role,
              mark a contractor, create a password reset link, or remove someone.
            </p>
          ) : null}
          <ul className="flex flex-col divide-y divide-border">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {m.user.name} {m.userId === user.id ? <span className="text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="text-muted-foreground">{m.user.email}</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {canManage ? (
                    <>
                      <CostRateField
                        kind="bill"
                        membershipId={m.id}
                        value={m.billRate?.toString() ?? ""}
                        name={m.user.name}
                        placeholder={org.defaultBillRate?.toString() ?? "—"}
                        currency={org.defaultCurrency}
                      />
                      <CostRateField
                        membershipId={m.id}
                        value={m.costRate?.toString() ?? ""}
                        name={m.user.name}
                        currency={org.defaultCurrency}
                      />
                    </>
                  ) : null}
                  {m.employmentType === "CONTRACTOR" ? (
                    <Badge variant="outline" className="font-normal">
                      Contractor
                    </Badge>
                  ) : null}
                  {canManage && !m.user.twoFactorEnabled && !ssoOnly(m.role) ? (
                    <Badge
                      variant={org.requireTwoFactor ? "destructive" : "outline"}
                      className="font-normal"
                      title={
                        org.requireTwoFactor
                          ? "Hasn't set up an authenticator app yet — they can't use the app until they do (unless they sign in with SSO)."
                          : "Hasn't set up an authenticator app (two-factor authentication)."
                      }
                    >
                      No 2FA
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="font-normal">
                    {m.role === "OWNER" ? "Owner" : m.role === "ADMIN" ? "Admin" : "Member"}
                  </Badge>
                  {canManage && (m.role !== "OWNER" || (role === "OWNER" && m.userId !== user.id)) ? (
                    <MemberRowActions
                      membershipId={m.id}
                      name={m.user.name}
                      role={m.role}
                      employmentType={m.employmentType}
                      canResetPassword={m.userId !== user.id && !ssoOnly(m.role)}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent>
            {invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {invites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between gap-2 py-3">
                    <div className="text-sm">
                      <p className="font-medium">{invite.email}</p>
                      <p className="text-muted-foreground">
                        Invited as {invite.role === "ADMIN" ? "Admin" : "Member"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyButton value={`${origin}/invite/${invite.token}`} />
                      <form action={revokeInviteAction.bind(null, invite.id)}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          type="submit"
                          aria-label={`Revoke invite for ${invite.email}`}
                          title="Revoke invite"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
