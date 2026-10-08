import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { originFromHeaders } from "@/lib/request-origin";

// Auth.js derives its base URL (OAuth redirect_uri, allowed redirect origin)
// from the request URL, which Next sets to the internal listen address —
// rebuild it on the public origin the browser used.
function onPublicOrigin(req: NextRequest) {
  const origin = originFromHeaders(req.headers, req.nextUrl.protocol.replace(":", ""));
  if (!origin) return req;
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, origin);
  return new NextRequest(url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    // Required by Node's fetch when the body is a stream.
    duplex: "half",
  } as ConstructorParameters<typeof NextRequest>[1]);
}

export const GET = (req: NextRequest) => handlers.GET(onPublicOrigin(req));
export const POST = (req: NextRequest) => handlers.POST(onPublicOrigin(req));
