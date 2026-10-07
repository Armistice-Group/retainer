import { prisma } from "@/lib/prisma";
import { requireOrgContext } from "@/lib/org-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InviteDialog } from "./invite-dialog";
import { MemberRowActions } from "./member-row-actions";
import { CopyButton } from "@/components/copy-button";
import { revokeInviteAction } from "@/actions/org";
import { X } from "lucide-react";
import { getOrigin } from "@/lib/url";

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

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Members</CardTitle>
          {canManage ? <InviteDialog /> : null}
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {memberships.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-2 py-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {m.user.name} {m.userId === user.id ? <span className="text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="text-muted-foreground">{m.user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.employmentType === "CONTRACTOR" ? (
                    <Badge variant="outline" className="font-normal">
                      Contractor
                    </Badge>
                  ) : null}
                  <Badge variant="outline" className="font-normal">
                    {m.role === "OWNER" ? "Owner" : m.role === "ADMIN" ? "Admin" : "Member"}
                  </Badge>
                  {canManage && m.role !== "OWNER" ? (
                    <MemberRowActions
                      membershipId={m.id}
                      role={m.role}
                      employmentType={m.employmentType}
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
                        <Button variant="ghost" size="icon" className="size-7" type="submit">
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
