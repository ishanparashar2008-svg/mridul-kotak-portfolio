// Dev-only static server (zero dependencies). Not part of the site.
// Needed because browsers block ES modules when index.html is opened from disk (file://).
// Usage: node tools/serve.mjs [port] [--open]   (default port 5200)

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const root = resolve(fileURLToPath(new URL("../website", import.meta.url)));
const port = Number(process.argv.find((a) => /^\d+$/.test(a))) || 5200;
const shouldOpen = process.argv.includes("--open");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8"
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("outside root");

    let target = file;
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");

    const body = await readFile(target);
    res.writeHead(200, {
      "Content-Type": types[extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch {
    // Like Netlify: unknown paths get the site's own 404.html.
    const page = await readFile(join(root, "404.html")).catch(() => "404 - not found");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
  }
}).listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`The Render running at ${url}  (Ctrl+C to stop)`);
  if (shouldOpen) {
    const cmd = process.platform === "win32" ? `start "" "${url}"`
      : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  }
});
