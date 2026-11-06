// Dev-only helper that renders the placeholder art (not part of the site).
// Serves the project root and accepts POST /save?path=website/assets/... so the
// generator page can write the images and GLB models it renders.
// Usage: node tools/placeholders/server.mjs [port]   then open /tools/placeholders/generate.html

import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const writable = join(root, "website", "assets");
const port = Number(process.argv[2]) || 5211;

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".glb": "model/gltf-binary",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (req.method === "POST" && url.pathname === "/save") {
      const target = normalize(join(root, url.searchParams.get("path") || ""));
      if (!target.startsWith(writable)) throw new Error("path not allowed");
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.concat(chunks));
      console.log("saved", target.slice(root.length));
      res.writeHead(200).end("ok");
      return;
    }
    let file = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) throw new Error("outside root");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (err) {
    res.writeHead(req.method === "POST" ? 400 : 404).end(String(err.message));
  }
}).listen(port, () => console.log(`Placeholder generator at http://localhost:${port}/tools/placeholders/generate.html`));
