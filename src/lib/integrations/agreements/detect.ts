// Recognizes a pasted link to a signed agreement in DocuSign, Documenso or
// Ironclad, so the Add document dialog can link that agreement itself rather
// than a plain URL. Shared by the client (preview) and the server.

import type { AgreementProviderId } from "./parse";

export type DetectedAgreement = { provider: AgreementProviderId; externalId: string };

const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** `documensoHosts`: hosts of self-hosted Documenso instances to recognize
 * besides app.documenso.com (the server passes the org's). */
export function detectAgreementUrl(raw: string, documensoHosts: string[] = []): DetectedAgreement | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // app.docusign.com/documents/details/<envelopeId> (appdemo. for demo).
  if (host === "app.docusign.com" || host === "appdemo.docusign.com" || /(^|\.)docusign\.net$/.test(host)) {
    const m = path.match(GUID);
    return m ? { provider: "DOCUSIGN", externalId: m[1].toLowerCase() } : null;
  }

  // <instance>/documents/<id> or <instance>/t/<team>/documents/<id>.
  const documenso = ["app.documenso.com", ...documensoHosts.map((h) => h.toLowerCase())];
  if (documenso.includes(host)) {
    const m = path.match(/\/documents\/(\d+)(?:$|[/?#])/);
    return m ? { provider: "DOCUMENSO", externalId: m[1] } : null;
  }

  // Ironclad record links carry the record's id.
  if (host === "ironcladapp.com" || host.endsWith(".ironcladapp.com")) {
    const m = path.match(GUID);
    return m ? { provider: "IRONCLAD", externalId: m[1].toLowerCase() } : null;
  }
  return null;
}
