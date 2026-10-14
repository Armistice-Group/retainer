// Consultainer's service worker. Two jobs:
//
// 1. The share target. Sharing a screenshot or PDF to the installed app
//    from Android's share sheet POSTs it to /m/share. That never reaches the
//    server: the files are kept in a cache here and the phone view
//    (/m/share) picks them up, so they're uploaded by the signed-in page
//    like any other evidence.
// 2. A plain "you're offline" page instead of the browser's error when a
//    page can't load. Nothing else is cached; the app always loads fresh.

const INBOX = "share-inbox";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // A share arrives as a page navigation. The page's own server actions
  // also POST to /m/share, but as fetches, so they pass straight through.
  if (event.request.method === "POST" && event.request.mode === "navigate" && url.pathname === "/m/share") {
    event.respondWith(receiveShare(event.request));
    return;
  }

  if (event.request.mode === "navigate" && event.request.method === "GET") {
    event.respondWith(fetch(event.request).catch(() => offlinePage()));
  }
});

async function receiveShare(request) {
  let count = 0;
  try {
    const data = await request.formData();
    const files = data.getAll("files").filter((f) => typeof f !== "string" && f.size > 0);
    const cache = await caches.open(INBOX);
    // A new share replaces whatever was waiting from the last one.
    for (const key of await cache.keys()) await cache.delete(key);
    for (const [i, file] of files.entries()) {
      await cache.put(
        `/m/share/inbox/${i}`,
        new Response(file, {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-File-Name": encodeURIComponent(file.name || `Shared ${i + 1}`),
            "X-Shared-At": String(Date.now()),
          },
        })
      );
    }
    count = files.length;
  } catch {
    // Nothing readable came through; the page says so.
  }
  return Response.redirect(`/m/share?received=${count}`, 303);
}

function offlinePage() {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;background:#fafafa;color:#18181b;text-align:center}
@media (prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}}button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:#059669;color:#fff}</style>
<div><h1 style="font-size:20px">You're offline</h1><p>Consultainer needs a connection. Your timer keeps running on the server.</p>
<button onclick="location.reload()">Try again</button></div>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
