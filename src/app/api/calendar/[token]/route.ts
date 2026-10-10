import { feedForToken } from "@/lib/services/calendar-subscription";

// A person's calendar subscription: GET /api/calendar/<token>.ics, fetched by
// calendar apps with no session (the secret token is the credential; /api
// isn't behind the login redirect in src/proxy.ts). What it shows is worked
// out from the person's access when it's built, so leaving a project or the
// org takes effect within a few minutes. Unknown tokens cost one indexed
// lookup; known ones are cached for a few minutes (see feedForToken).

const TOKEN_RE = /^[A-Za-z0-9_-]{20,100}$/;

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!TOKEN_RE.test(token)) return notFound();

  const body = await feedForToken(token);
  if (body === null) return notFound();

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="consultainer.ics"',
      "Cache-Control": "private, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
