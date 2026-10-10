"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CopyButton } from "@/components/copy-button";
import {
  updateMemberRoleAction,
  removeMemberAction,
  updateMemberEmploymentTypeAction,
} from "@/actions/org";
import { createPasswordResetLinkAction, type ResetLinkResult } from "@/actions/password-reset";

export function MemberRowActions({
  membershipId,
  name,
  role,
  employmentType,
  canResetPassword,
  emailEnabled = false,
}: {
  membershipId: string;
  name: string;
  /** Owner rows only offer the reset link (and only to other owners). */
  role: "OWNER" | "ADMIN" | "MEMBER";
  employmentType: "EMPLOYEE" | "CONTRACTOR";
  canResetPassword: boolean;
  /** Email is set up: offer to email the reset link as well as copy it. */
  emailEnabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [reset, setReset] = useState<ResetLinkResult | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  /** Waiting for the owner/admin to pick email or copy (email set up only). */
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);

  function openReset() {
    setReset(null);
    setResetOpen(true);
    if (emailEnabled) {
      setChoosing(true);
    } else {
      createResetLink("copy");
    }
  }

  function createResetLink(delivery: "copy" | "email") {
    setChoosing(false);
    setCreating(true);
    startTransition(async () => {
      try {
        setReset(await createPasswordResetLinkAction(membershipId, delivery));
      } catch (err) {
        setReset({
          error: err instanceof Error ? err.message : "Couldn't create a reset link.",
        });
      } finally {
        setCreating(false);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={isPending}
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {role === "MEMBER" ? (
            <DropdownMenuItem
              onSelect={() => startTransition(() => updateMemberRoleAction(membershipId, "ADMIN"))}
            >
              Make admin
            </DropdownMenuItem>
          ) : role === "ADMIN" ? (
            <DropdownMenuItem
              onSelect={() => startTransition(() => updateMemberRoleAction(membershipId, "MEMBER"))}
            >
              Make member
            </DropdownMenuItem>
          ) : null}
          {role === "OWNER" ? null : employmentType === "EMPLOYEE" ? (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(() => updateMemberEmploymentTypeAction(membershipId, "CONTRACTOR"))
              }
            >
              Mark as contractor
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() =>
                startTransition(() => updateMemberEmploymentTypeAction(membershipId, "EMPLOYEE"))
              }
            >
              Mark as employee
            </DropdownMenuItem>
          )}
          {canResetPassword ? (
            <DropdownMenuItem onSelect={openReset}>Create password reset link</DropdownMenuItem>
          ) : null}
          {role === "OWNER" ? null : (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  if (window.confirm("Remove this person from the organization?")) {
                    startTransition(() => removeMemberAction(membershipId));
                  }
                }}
              >
                Remove
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset link for {name}</DialogTitle>
            <DialogDescription>
              {emailEnabled
                ? `Email it to ${name}, or copy it and send it yourself — by chat or in person.`
                : `Send this to ${name} yourself — by chat or in person.`}{" "}
              It works once, expires in 24 hours, and replaces any earlier reset link. Their
              two-factor authentication stays on.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4">
            {choosing ? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => createResetLink("email")}>
                  Email it to them
                </Button>
                <Button type="button" variant="outline" onClick={() => createResetLink("copy")}>
                  Copy a link instead
                </Button>
              </div>
            ) : reset === null || creating ? (
              <p className="text-sm text-muted-foreground">Creating link...</p>
            ) : "error" in reset ? (
              <Alert variant="destructive">
                <AlertDescription>{reset.error}</AlertDescription>
              </Alert>
            ) : reset.emailedTo ? (
              <Alert>
                <AlertDescription>
                  Emailed a reset link to {reset.emailedTo}. It expires in {reset.expiresIn}.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                {reset.emailFailed ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Couldn&apos;t send the email. Copy the link and send it to {name} yourself.
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex items-center gap-2 rounded-lg border border-border p-2">
                  <code className="min-w-0 flex-1 truncate text-sm">{reset.url}</code>
                  <CopyButton value={reset.url} label="Copy" />
                </div>
              </>
            )}
            <Button type="button" className="self-start" onClick={() => setResetOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
