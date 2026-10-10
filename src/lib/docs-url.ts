// The public docs (docs/*.mdx, published at https://consultainer.app/docs/).
// Settings cards link to the matching page with a "Full guide" link.
//
// Forks that publish their own docs: set DOCS_URL when building the image
// (`docker build --build-arg DOCS_URL=https://example.com/docs .`, or in the
// environment of `npm run build`). It's baked in at build time through
// next.config.ts, because client components render these links too.
export const DEFAULT_DOCS_URL = "https://consultainer.app/docs";

export const DOCS_URL = (process.env.NEXT_PUBLIC_DOCS_URL || DEFAULT_DOCS_URL).replace(/\/+$/, "");

// docsUrl("integrations/linear") -> https://consultainer.app/docs/integrations/linear/
// docsUrl("self-hosting#file-storage") keeps the anchor.
export function docsUrl(page: string): string {
  const [path, hash] = page.replace(/^\/+/, "").split("#");
  return `${DOCS_URL}/${path.replace(/\/+$/, "")}/${hash ? `#${hash}` : ""}`;
}
