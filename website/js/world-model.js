/**
 * A project's own model for the void (the optional "worldModel" field in
 * data/projects.json), ready for the render passes.
 *
 * The GLB (made by 3d/build_models.py) is baked into one geometry space,
 * centred and scaled to the same footprint as the primitives in shapes.js,
 * so labels, picking and the camera framing need no changes. Each mesh gets
 * the textured render material (dissolve in as clay, then blend to its own
 * Blender materials), and one merged edge-line geometry drives the
 * wireframe pass: feature edges only, so it reads as a clean model.
 *
 * Used by world.js (the void) and case/next-preview.js (the footer preview).
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { createTexturedRenderMaterial } from "./render-material.js";
import { TARGET_RADIUS } from "./shapes.js";

const EDGE_ANGLE = 18; // degrees between faces before an edge is drawn in the wireframe pass

let loader = null;

const GETTERS = ["getX", "getY", "getZ", "getW"];

/** A copy of the geometry with every attribute as plain (non-normalised) floats. */
function toFloat(source) {
  const geometry = new THREE.BufferGeometry();
  if (source.index) geometry.setIndex(source.index.clone());
  for (const [name, attr] of Object.entries(source.attributes)) {
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr[GETTERS[k]](i);
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
  }
  return geometry;
}

/**
 * @param {string} src  path to the GLB
 * @param {object} opts { clay, edgeColor, envMap } as for createTexturedRenderMaterial
 * @returns {Promise<{ group: THREE.Group, wire: THREE.BufferGeometry, parts: Array, radius: number, dispose: Function }>}
 */
export async function loadWorldModel(src, { clay, edgeColor, envMap = null }) {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  const gltf = await loader.loadAsync(src);
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  // One geometry space: bake every node transform into its geometry. Meshopt
  // stores positions and normals as quantised integers (the scale lives on the
  // node), so go to floats first or the baked values overflow.
  const pieces = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const geometry = toFloat(o.geometry).applyMatrix4(o.matrixWorld);
    pieces.push({ geometry, material: o.material });
  });
  if (!pieces.length) throw new Error(`${src} has no meshes`);

  // Centre and scale to the primitives' footprint.
  const box = new THREE.Box3();
  pieces.forEach((p) => {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  });
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const s = TARGET_RADIUS / sphere.radius;
  const fit = new THREE.Matrix4().makeScale(s, s, s).multiply(new THREE.Matrix4().makeTranslation(-sphere.center.x, -sphere.center.y, -sphere.center.z));
  const halfH = ((box.max.y - box.min.y) / 2) * s;

  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  for (const p of pieces) {
    p.geometry.applyMatrix4(fit);
    p.geometry.computeBoundingSphere();
    const { material, set } = createTexturedRenderMaterial(p.material, {
      clay,
      edgeColor,
      envMap,
      sweepCenter: ((box.min.y + box.max.y) / 2 - sphere.center.y) * s,
      sweepHalf: halfH + 0.05,
    });
    const mesh = new THREE.Mesh(p.geometry, material);
    group.add(mesh);
    parts.push({ mesh, material, set, base: p.material });
    const e = new THREE.EdgesGeometry(p.geometry, EDGE_ANGLE);
    edges.push(e.attributes.position.array);
    e.dispose();
  }

  const merged = new Float32Array(edges.reduce((n, a) => n + a.length, 0));
  let offset = 0;
  for (const a of edges) {
    merged.set(a, offset);
    offset += a.length;
  }
  const wire = new THREE.BufferGeometry();
  wire.setAttribute("position", new THREE.BufferAttribute(merged, 3));

  return {
    group,
    wire,
    parts,
    radius: TARGET_RADIUS,
    dispose() {
      parts.forEach((p) => {
        p.mesh.geometry.dispose();
        p.material.dispose();
        p.base.dispose?.();
      });
      wire.dispose();
    },
  };
}
