import "server-only";
import { ShareNotice, ShareShell } from "./share-shell";
import { ShareGateForm } from "./share-gate-form";
import { shareUnavailableMessage, type ShareAccess, type ShareTarget } from "@/lib/share-gate";

/** What a share page renders instead of its content: the expired notice,
 * the "verification unavailable" notice, or the email/code gate. Shows the
 * org's name and logo only. */
export function ShareBlocked({ target, access }: { target: ShareTarget; access: ShareAccess | null }) {
  const { org } = target.client;
  if (target.expired) {
    return (
      <ShareNotice org={org} title="This link has expired">
        This link has expired. Ask {org.name} for a new one.
      </ShareNotice>
    );
  }
  if (!access || access.state === "unavailable" || access.state === "open" || access.state === "verified") {
    return (
      <ShareNotice org={org} title="Verification unavailable">
        {shareUnavailableMessage(org.name)}
      </ShareNotice>
    );
  }
  return (
    <ShareShell org={org}>
      <ShareGateForm
        key={access.state}
        kind={target.kind}
        token={target.token}
        orgName={org.name}
        stage={access.state}
      />
    </ShareShell>
  );
}
