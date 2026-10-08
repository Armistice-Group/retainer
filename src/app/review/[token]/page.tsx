import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Paperclip, User } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/forms/confirm-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { approveContractorAction, rejectContractorAction } from "@/actions/project-review";

export const metadata: Metadata = {
  title: "Contractor review",
  robots: { index: false, follow: false },
};

export default async function ContractorReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const member = await prisma.projectMember.findUnique({
    where: { approvalToken: token },
    include: { project: { include: { client: true, org: true } }, user: true },
  });
  if (!member) notFound();

  const membership = await prisma.membership.findUnique({
    where: { userId_orgId: { userId: member.userId, orgId: member.project.orgId } },
  });

  const org = member.project.org;
  const logoSrc = org.logoData
    ? `data:${org.logoContentType};base64,${Buffer.from(org.logoData).toString("base64")}`
    : org.logoUrl;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/data-URI logo
            <img src={logoSrc} alt={org.name} className="h-8 max-w-[160px] object-contain" />
          ) : (
            <span className="text-lg font-semibold tracking-tight">{org.name}</span>
          )}
          <span className="text-sm text-muted-foreground">Contractor review</span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-10">
        <div>
          <p className="text-sm text-muted-foreground">
            {org.name} would like {member.project.client.name} to review this person before they
            start on {member.project.name}.
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <User className="size-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{member.user.name}</CardTitle>
              {membership?.title ? (
                <p className="text-sm text-muted-foreground">{membership.title}</p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {membership?.bio ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{membership.bio}</p>
            ) : (
              <p className="text-sm text-muted-foreground">No bio provided.</p>
            )}
            {membership?.resumeFileData ? (
              <a
                href={`/api/review/${token}/resume`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-fit items-center gap-1 text-sm text-brand hover:underline"
              >
                <Paperclip className="size-3.5" /> Resume
              </a>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between gap-4 pt-6">
            {member.approvalStatus === "PENDING" ? (
              <>
                <p className="text-sm text-muted-foreground">Approve this person for staffing?</p>
                <div className="flex gap-2">
                  <form action={rejectContractorAction.bind(null, token)}>
                    <ConfirmSubmitButton
                      variant="outline"
                      confirmMessage={`Reject ${member.user.name} for this engagement?`}
                    >
                      Reject
                    </ConfirmSubmitButton>
                  </form>
                  <form action={approveContractorAction.bind(null, token)}>
                    <ConfirmSubmitButton confirmMessage={`Approve ${member.user.name} for this engagement?`}>
                      Approve
                    </ConfirmSubmitButton>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Status:</span>
                <StatusBadge status={member.approvalStatus} />
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
