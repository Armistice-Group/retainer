import { Database, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocsLink } from "@/components/docs-link";

/** Where uploaded files are kept — read-only; set in the server's environment. */
export function StorageCard({
  mode,
  bucket,
  reachable,
  error,
}: {
  mode: "database" | "object";
  bucket: string | null;
  reachable: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {mode === "object" ? <HardDrive className="size-4" /> : <Database className="size-4" />} File storage
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {mode === "object" ? (
          <>
            <p>
              Uploads go to the <strong>{bucket}</strong> bucket (S3-compatible), up to 25MB each.
            </p>
            <p className={reachable ? "text-muted-foreground" : "text-destructive"}>
              {reachable ? "The bucket is reachable." : `Can't reach the bucket: ${error ?? "unknown error"}`}
            </p>
            {reachable ? null : (
              <p className="text-xs text-muted-foreground">
                Check <code>S3_BUCKET</code>, <code>S3_REGION</code>, <code>S3_ENDPOINT</code> and the
                access keys in the server&apos;s <code>.env</code> (MinIO and most self-hosted servers
                also need <code>S3_FORCE_PATH_STYLE=true</code>), then run{" "}
                <code>docker compose up -d</code>.
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-muted-foreground">
              Uploads are stored in the database, up to 5MB each. S3-compatible storage (AWS S3, R2,
              MinIO, B2…) raises that to 25MB. Links to Drive, Dropbox, OneDrive and Notion don&apos;t
              use storage at all.
            </p>
            <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                How to use S3-compatible storage
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>Create a private bucket, and an access key that can read, write and delete in it.</li>
                <li>
                  In the server&apos;s <code>.env</code>, set <code>S3_BUCKET</code>,{" "}
                  <code>S3_REGION</code> (R2: <code>auto</code>), <code>S3_ACCESS_KEY_ID</code> and{" "}
                  <code>S3_SECRET_ACCESS_KEY</code>. For anything but AWS, also set{" "}
                  <code>S3_ENDPOINT</code>; for MinIO, <code>S3_FORCE_PATH_STYLE=true</code>.
                </li>
                <li>
                  Run <code>docker compose up -d</code>. This card should then say the bucket is
                  reachable.
                </li>
                <li>
                  Optional — move existing uploads into the bucket:
                  <code className="mt-1 block break-all rounded bg-muted px-2 py-1">
                    docker compose exec consultainer-app node_modules/.bin/tsx
                    scripts/move-files-to-object-storage.mts
                  </code>
                  (add <code>--dry-run</code> to just count). Keep the <code>S3_*</code> settings
                  afterwards — moved files can&apos;t be read without them.
                </li>
              </ol>
              <DocsLink page="self-hosting#file-storage" />
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
