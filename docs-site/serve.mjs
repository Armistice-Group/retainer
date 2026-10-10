// Local preview that mirrors consultainer.app: site/ at /, the built docs at
// /docs/, docs/screenshots at /screenshots/.  node serve.mjs [port]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 4321);
const mounts = [
  ["/docs/", path.join(here, "dist")],
  ["/screenshots/", path.resolve(here, "../docs/screenshots")],
  ["/", path.resolve(here, "../site")],
];
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".wasm": "application/wasm",
  ".pf_meta": "application/octet-stream", ".pf_index": "application/octet-stream", ".pf_fragment": "application/octet-stream",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (url === "/docs") return redirect(res, "/docs/");
    const [prefix, dir] = mounts.find(([p]) => url.startsWith(p));
    let file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir)) return send(res, 403, "forbidden");
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!url.endsWith("/")) return redirect(res, url + "/");
      file = path.join(file, "index.html");
    }
    if (!fs.existsSync(file)) return send(res, 404, "not found");
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port, () => console.log(`http://localhost:${port}/docs/`));

function redirect(res, to) {
  res.writeHead(301, { location: to });
  res.end();
}
function send(res, code, body) {
  res.writeHead(code, { "content-type": "text/plain" });
  res.end(body);
}
