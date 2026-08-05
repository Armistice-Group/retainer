"use client";

import { useActionState } from "react";
import { Paperclip } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateContractorProfileAction } from "@/actions/profile";
import type { ActionState } from "@/actions/auth";

export function ContractorProfileCard({
  membershipId,
  title,
  bio,
  hasResume,
}: {
  membershipId: string;
  title: string | null;
  bio: string | null;
  hasResume: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateContractorProfileAction,
    null
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Contractor profile</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          {state?.error ? (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <p className="text-sm text-muted-foreground">
            Shown to a client when a project admin asks them to review you for staffing on an
            engagement.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contractor-title">Title</Label>
            <Input
              id="contractor-title"
              name="title"
              placeholder="e.g. Senior Backend Engineer"
              defaultValue={title ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contractor-bio">Bio</Label>
            <Textarea
              id="contractor-bio"
              name="bio"
              rows={5}
              placeholder="A short summary of your experience and background."
              defaultValue={bio ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contractor-resume">Resume</Label>
            <Input
              id="contractor-resume"
              name="resumeFile"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
            />
            {hasResume ? (
              <a
                href={`/api/members/${membershipId}/resume`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <Paperclip className="size-3.5" /> Current resume
              </a>
            ) : null}
          </div>
          <SubmitButton pendingText="Saving...">Save profile</SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
