import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd(), "web-dist");
const port = Number(process.env.EXPO_PORT || 8081);
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

function resolveFile(urlPath) {
  const requested = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, "");
  const candidate = resolve(root, requested || "index.html");
  if (!candidate.startsWith(root)) return join(root, "index.html");
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return join(root, "index.html");
}

createServer((request, response) => {
  const file = resolveFile(new URL(request.url || "/", "http://localhost").pathname);
  if (!existsSync(file)) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Web export was not created.");
    return;
  }
  response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(response);
}).listen(port, "0.0.0.0", () => console.log(`Web preview listening on http://localhost:${port}`));
