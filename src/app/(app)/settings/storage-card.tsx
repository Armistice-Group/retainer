import { Database, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
          </>
        ) : (
          <p className="text-muted-foreground">
            Uploads are stored in the database, up to 5MB each. Set <code className="text-xs">S3_BUCKET</code>{" "}
            (and its credentials) on the server to use S3, R2, MinIO or similar instead — see the
            self-hosting docs. Links to Drive, Dropbox, OneDrive and Notion don&apos;t use storage at all.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
