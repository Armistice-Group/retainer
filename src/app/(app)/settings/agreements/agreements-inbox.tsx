"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/forms/submit-button";
import { dismissAgreementAction, linkAgreementAction, restoreAgreementAction } from "@/actions/agreements";
import { formatDate } from "@/lib/format";
import type { ActionState } from "@/actions/auth";

type Signer = { name: string | null; email: string | null };

export type InboxAgreement = {
  id: string;
  title: string;
  providerLabel: string;
  signedAt: string | null;
  signers: Signer[];
  externalUrl: string | null;
  hasFile: boolean;
  suggestedClientId?: string | null;
};

export type InboxClient = { id: string; name: string; projects: { id: string; name: string }[] };

const selectClass = "h-8 min-w-0 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs";

function Signers({ signers }: { signers: Signer[] }) {
  if (!signers.length) return null;
  return (
    <span className="text-xs text-muted-foreground">
      {signers.map((s, i) => (
        <span key={i}>
          {i ? ", " : ""}
          {s.name ?? s.email}
          {s.name && s.email ? ` <${s.email}>` : ""}
        </span>
      ))}
    </span>
  );
}

function Meta({ a }: { a: InboxAgreement }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary">{a.providerLabel}</Badge>
      <span className="text-xs text-muted-foreground">
        {a.signedAt ? `Signed ${formatDate(a.signedAt)}` : "Signed"}
      </span>
      {a.externalUrl ? (
        <Link
          href={`/api/agreements/${a.id}?open=1`}
          target="_blank"
          rel="noreferrer"
          prefetch={false}
          className="flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <ExternalLink className="size-3" /> Open
        </Link>
      ) : null}
      {a.hasFile ? (
        <Link
          href={`/api/agreements/${a.id}?download=1`}
          prefetch={false}
          className="flex items-center gap-1 text-xs text-brand hover:underline"
        >
          <Download className="size-3" /> Signed copy
        </Link>
      ) : null}
    </div>
  );
}

function InboxRow({ agreement, clients }: { agreement: InboxAgreement; clients: InboxClient[] }) {
  const [clientId, setClientId] = useState(agreement.suggestedClientId ?? "");
  const [state, formAction] = useActionState<ActionState, FormData>(
    linkAgreementAction.bind(null, agreement.id),
    null
  );
  const projects = clients.find((c) => c.id === clientId)?.projects ?? [];
  const suggested = clients.find((c) => c.id === agreement.suggestedClientId);
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{agreement.title}</p>
        <Meta a={agreement} />
        <Signers signers={agreement.signers} />
        {suggested ? (
          <p className="text-xs text-muted-foreground">
            Suggested: <strong>{suggested.name}</strong> (signer email matches)
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <select
            name="clientId"
            aria-label="Client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={selectClass}
            required
          >
            <option value="">Pick a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {projects.length ? (
            <select name="projectId" aria-label="Project" defaultValue="" className={selectClass} key={clientId}>
              <option value="">Whole client</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}
          <SubmitButton size="sm" pendingText="Linking...">
            Link
          </SubmitButton>
        </form>
        <form action={dismissAgreementAction.bind(null, agreement.id)}>
          <Button type="submit" variant="ghost" size="sm">
            Dismiss
          </Button>
        </form>
      </div>
      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </li>
  );
}

export function AgreementsInbox({ agreements, clients }: { agreements: InboxAgreement[]; clients: InboxClient[] }) {
  if (!agreements.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to link. New signed agreements show up here after each sync.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {agreements.map((a) => (
        <InboxRow key={a.id} agreement={a} clients={clients} />
      ))}
    </ul>
  );
}

export function DismissedAgreements({ agreements }: { agreements: InboxAgreement[] }) {
  if (!agreements.length) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">Dismissed ({agreements.length})</summary>
      <ul className="mt-2 flex flex-col divide-y divide-border">
        {agreements.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="truncate text-sm">{a.title}</p>
              <Meta a={a} />
            </div>
            <form action={restoreAgreementAction.bind(null, a.id)}>
              <Button type="submit" variant="outline" size="sm">
                Back to inbox
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
