import { docsUrl } from "@/lib/docs-url";

// "Full guide →" link to a docs page, shown under the in-app setup steps.
export function DocsLink({ page, children = "Full guide" }: { page: string; children?: React.ReactNode }) {
  return (
    <a
      href={docsUrl(page)}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-block text-xs font-medium text-brand hover:underline"
    >
      {children} →
    </a>
  );
}
