import "server-only";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit";
import { APP_VERSION_LABEL } from "@/lib/app-version";
import { exportEntries, type ExportScope } from "@/lib/portability/export";
import { zipReadableStream } from "@/lib/portability/zip";

/** Records the export in the audit log, then streams the ZIP. */
export async function exportZipResponse(params: {
  scope: ExportScope;
  orgName: string;
  orgSlug: string;
  clientName?: string;
  actor: { id: string; name?: string | null; email?: string | null };
}) {
  const { scope, clientName, actor } = params;
  await recordAuditEvent(prisma, {
    orgIds: [scope.orgId],
    actorId: actor.id,
    action: "export",
    entityType: scope.clientId ? "Client" : "Organization",
    entityId: scope.clientId ?? scope.orgId,
    entityLabel: scope.clientId ? `All records for ${clientName}` : `Everything in ${params.orgName}`,
  });

  const date = new Date().toISOString().slice(0, 10);
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";
  const fileName = scope.clientId
    ? `${slug(params.orgSlug)}-${slug(clientName ?? "client")}-${date}.zip`
    : `${slug(params.orgSlug)}-export-${date}.zip`;

  const stream = zipReadableStream(
    exportEntries(scope, {
      orgName: params.orgName,
      clientName,
      exportedBy: actor.email ? `${actor.name ?? ""} <${actor.email}>`.trim() : (actor.name ?? actor.id),
      appVersion: APP_VERSION_LABEL,
    }),
    { onError: (err) => console.error("[export] archive failed part-way", err) }
  );
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
