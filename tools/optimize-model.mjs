// Dev-only: optimise a GLB for the hero (not part of the site).
//
// Usage (from the The-Render folder):
//   node tools/optimize-model.mjs "C:\path\to\Model.glb" statue-3
//
// Writes two files into website/assets/models/:
//   <name>.glb       the display model: colour and normal maps at 1024px WebP,
//                    roughness/metal/AO/emissive maps at 512px (soft data, the
//                    difference is invisible), tangents dropped (Three.js
//                    derives them in the shader), geometry Meshopt-compressed.
//                    Used for clay, lit and final.
//   <name>-wire.glb  a tiny untextured, simplified copy used only for the
//                    wireframe pass, so it loads first and draws cleanly.
// The original file is never modified.
//
// Options: --tex 2048 (texture size, default 1024), --wire 0.06 (share of
// triangles kept for the wireframe copy, default 0.08), --wire-error 0.003 (lower keeps more detail),
// --no-wire (skip the wireframe copy; the void's project models draw their own edges),
// --out <file.glb> (write the display model there instead of website/assets/models/<name>.glb).
// The name may include a subfolder, e.g. world/kiln -> website/assets/models/world/kiln.glb.

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, simplify, meshopt, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";
import { mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const BOOLEAN_FLAGS = new Set(["--no-wire"]);
const [input, name] = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && !BOOLEAN_FLAGS.has(args[i - 1])));
const NO_WIRE = args.includes("--no-wire");
const OUT_FILE = args.includes("--out") ? resolve(args[args.indexOf("--out") + 1]) : null;
if (!input || !name) {
  console.log('Usage: node tools/optimize-model.mjs "C:\\path\\Model.glb" model-name [--tex 1024] [--wire 0.06]');
  process.exit(1);
}
const TEX = flag("tex", 1024);
const WIRE = flag("wire", 0.08);
// Max geometric error for the wireframe copy (share of model size). Small enough
// that thin parts (vines, straps, hair) keep their shape instead of collapsing.
const WIRE_ERROR = flag("wire-error", 0.003);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "website", "assets", "models");
await mkdir(outDir, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

const kb = async (f) => `${((await stat(f)).size / 1024).toFixed(0)} KB`;
const triangles = (doc) =>
  doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())
    .reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute("POSITION").getCount()) / 3, 0);

console.log(`Input  ${input}  (${await kb(input)})`);

// ---- Display model -------------------------------------------------------
const full = await io.read(input);
const fullTris = triangles(full);
for (const prim of full.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) prim.setAttribute("TANGENT", null);
const DATA_MAPS = /metallicRoughness|occlusion|emissive/;
await full.transform(
  dedup(),
  prune(),
  // Soft data maps first (half size), then colour and normal maps.
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX / 2, TEX / 2], quality: 78, slots: DATA_MAPS }),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX, TEX], quality: 82, slots: /baseColor|normal/ }),
  meshopt({ encoder: MeshoptEncoder, level: "high" })
);
const fullOut = OUT_FILE || join(outDir, `${name}.glb`);
await mkdir(dirname(fullOut), { recursive: true });
await io.write(fullOut, full);
console.log(`Model  ${fullOut}  (${await kb(fullOut)}, ${Math.round(fullTris).toLocaleString()} triangles, textures ${TEX}px)`);

if (NO_WIRE) process.exit(0);

// ---- Wireframe copy: geometry only, simplified ------------------------------
const wire = await io.read(input);
for (const prim of wire.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
  prim.setMaterial(null);
  for (const semantic of prim.listSemantics()) if (semantic !== "POSITION") prim.setAttribute(semantic, null);
}
await wire.transform(
  prune(),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: WIRE, error: WIRE_ERROR }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: "medium" })
);
const wireOut = join(outDir, `${name}-wire.glb`);
await io.write(wireOut, wire);
console.log(`Wire   ${wireOut}  (${await kb(wireOut)}, ${Math.round(triangles(wire)).toLocaleString()} triangles)`);
