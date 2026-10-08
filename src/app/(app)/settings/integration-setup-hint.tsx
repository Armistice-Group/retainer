import { CopyButton } from "@/components/copy-button";

/** Shown in place of a Connect button when the instance has no OAuth app
 * credentials for an integration: what to register, and what to set. */
export function IntegrationSetupHint({
  appUrl,
  appLabel,
  callbackUrl,
  envVars,
}: {
  appUrl: string;
  appLabel: string;
  callbackUrl: string;
  envVars: string[];
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4 text-sm">
      <p className="font-medium">Not set up on this instance</p>
      <ol className="flex list-decimal flex-col gap-2 pl-4 text-muted-foreground">
        <li>
          Create an OAuth app at{" "}
          <a href={appUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
            {appLabel}
          </a>{" "}
          with this callback URL:
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs text-foreground">
              {callbackUrl}
            </code>
            <CopyButton value={callbackUrl} label="Copy" />
          </div>
        </li>
        <li>
          Add{" "}
          {envVars.map((v, i) => (
            <span key={v}>
              {i > 0 ? " and " : ""}
              <code className="text-xs text-foreground">{v}</code>
            </span>
          ))}{" "}
          to the server&apos;s <code className="text-xs text-foreground">.env</code>, then run{" "}
          <code className="text-xs text-foreground">docker compose up -d</code>.
        </li>
      </ol>
    </div>
  );
}
