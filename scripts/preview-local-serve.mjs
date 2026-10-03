#!/usr/bin/env node
// Serves a web static export (`expo export --platform web`) on localhost and mounts the gitignored
// repo-root `preview-local/` folder (your own clips + film-shots.json) at /preview-local/ next to it,
// so a local preview build seeds them as device-local film shots. Nothing is copied into the export
// and nothing leaves this machine. Usage: node scripts/preview-local-serve.mjs <export-dir> [port] [host]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exportDir = process.argv[2] ? resolve(process.argv[2]) : null;
const port = Number(process.argv[3] ?? 8095);
// Default to loopback; pass 0.0.0.0 to open it to phones on the same Wi-Fi.
const host = process.argv[4] ?? "127.0.0.1";
const previewLocalDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "preview-local");

if (!exportDir || !existsSync(join(exportDir, "index.html"))) {
  console.error("usage: node scripts/preview-local-serve.mjs <export-dir> [port] [host]  (export-dir must contain index.html)");
  process.exit(1);
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

/** Resolves a request path to a file: the mounted folder, a static file, a route page, or the not-found page. */
function resolveFile(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/\\/g, "/").replace(/^(\.\.\/)+/, "");
  if (clean.startsWith("/preview-local/")) {
    const candidate = join(previewLocalDir, clean.slice("/preview-local/".length));
    return candidate.startsWith(previewLocalDir) && isFile(candidate) ? { file: candidate, status: 200 } : null;
  }
  const direct = join(exportDir, clean);
  if (direct.startsWith(exportDir) && isFile(direct)) return { file: direct, status: 200 };
  if (clean === "/") return { file: join(exportDir, "index.html"), status: 200 };
  const page = join(exportDir, `${clean}.html`);
  if (page.startsWith(exportDir) && isFile(page)) return { file: page, status: 200 };
  const notFound = join(exportDir, "+not-found.html");
  return isFile(notFound) ? { file: notFound, status: 404 } : null;
}

createServer((request, response) => {
  const resolved = resolveFile(request.url ?? "/");
  if (!resolved) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
    return;
  }
  response.writeHead(resolved.status, {
    "content-type": TYPES[extname(resolved.file).toLowerCase()] ?? "application/octet-stream",
    "content-length": statSync(resolved.file).size,
    "cache-control": "no-store",
  });
  createReadStream(resolved.file).pipe(response);
}).listen(port, host, () => {
  const mounted = existsSync(join(previewLocalDir, "film-shots.json")) ? "mounted" : "absent (no manifest; nothing will be seeded)";
  console.log(`preview: http://${host}:${port}/  export: ${exportDir}  preview-local: ${mounted}`);
});
