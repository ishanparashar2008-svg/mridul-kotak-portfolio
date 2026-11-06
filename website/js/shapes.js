/**
 * Primitive library for the project world.
 *
 * A project's optional "shape" field in data/projects.json picks one of
 * these. Each shape has a smooth surface geometry and a lighter geometry
 * for the wireframe pass. Both are normalised to the same size and cached,
 * so two projects with the same shape share geometry.
 *
 * Supported: sphere, torus, shard, cube, capsule, octahedron, cone, knot, cylinder
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const SHAPE_NAMES = ["sphere", "torus", "shard", "cube", "capsule", "octahedron", "cone", "knot", "cylinder"];

export const TARGET_RADIUS = 1.15; // every shape (and project model, see world-model.js) fits inside a sphere of this radius

// surface: smooth mesh. wire: lower-res source for the wireframe. flat: faceted shading.
const BUILDERS = {
  sphere: {
    surface: () => new THREE.SphereGeometry(1, 96, 64),
    wire: () => new THREE.IcosahedronGeometry(1.004, 3),
  },
  torus: {
    surface: () => new THREE.TorusGeometry(0.82, 0.33, 64, 160),
    wire: () => new THREE.TorusGeometry(0.82, 0.332, 12, 40),
  },
  shard: {
    surface: () => new THREE.IcosahedronGeometry(1, 0).scale(0.68, 1.45, 0.62),
    wire: () => new THREE.IcosahedronGeometry(1, 0).scale(0.68, 1.45, 0.62),
    flat: true,
  },
  cube: {
    surface: () => new RoundedBoxGeometry(1.5, 1.5, 1.5, 5, 0.14),
    wire: () => new THREE.BoxGeometry(1.5, 1.5, 1.5, 4, 4, 4),
  },
  capsule: {
    surface: () => new THREE.CapsuleGeometry(0.55, 1.15, 24, 64),
    wire: () => new THREE.CapsuleGeometry(0.552, 1.15, 6, 16),
  },
  octahedron: {
    surface: () => new THREE.OctahedronGeometry(1, 0),
    wire: () => new THREE.OctahedronGeometry(1, 1),
    flat: true,
  },
  cone: {
    surface: () => new THREE.ConeGeometry(0.95, 1.8, 96, 1),
    wire: () => new THREE.ConeGeometry(0.955, 1.8, 18, 4),
  },
  knot: {
    surface: () => new THREE.TorusKnotGeometry(0.72, 0.24, 220, 36, 3, 4),
    wire: () => new THREE.TorusKnotGeometry(0.72, 0.242, 110, 10, 3, 4),
  },
  cylinder: {
    surface: () => new THREE.CylinderGeometry(0.75, 0.75, 1.7, 96, 1),
    wire: () => new THREE.CylinderGeometry(0.752, 0.752, 1.7, 18, 4),
  },
};

const cache = new Map();

/**
 * @returns {{ surface: THREE.BufferGeometry, wire: THREE.WireframeGeometry,
 *             radius: number, sweepHalf: number, flat: boolean }}
 */
export function getShape(name) {
  const key = BUILDERS[name] ? name : "sphere";
  if (cache.has(key)) return cache.get(key);

  const b = BUILDERS[key];
  const surface = b.surface();
  surface.computeBoundingSphere();
  const scale = TARGET_RADIUS / surface.boundingSphere.radius;
  surface.scale(scale, scale, scale);
  surface.computeBoundingBox();
  surface.computeBoundingSphere();

  const wireSrc = b.wire().scale(scale, scale, scale);
  const wire = new THREE.WireframeGeometry(wireSrc);
  wireSrc.dispose();

  const bb = surface.boundingBox;
  const shape = {
    surface,
    wire,
    radius: surface.boundingSphere.radius,
    sweepHalf: Math.max(bb.max.y, -bb.min.y) + 0.05,
    flat: !!b.flat,
  };
  cache.set(key, shape);
  return shape;
}

/** Free every cached geometry (called when the world is torn down). */
export function disposeShapes() {
  cache.forEach((s) => {
    s.surface.dispose();
    s.wire.dispose();
  });
  cache.clear();
}
