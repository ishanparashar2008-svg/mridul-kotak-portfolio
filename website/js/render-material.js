/**
 * The shared "render" material: a MeshPhysicalMaterial with a dissolve patch.
 *
 * uReveal (0..1.02) controls how much of the surface exists. Fragments the
 * dissolve has not reached are discarded, and a thin glowing edge in the
 * accent colour runs along the front. Used by the hero knot (scene.js) and
 * every project object in the void (world.js), so the effect is identical.
 *
 * All materials made here share one compiled shader program.
 */

import * as THREE from "three";

/** Read a colour token from css/tokens.css so WebGL and CSS share one palette. */
export function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

// Small GLSL value-noise used by the dissolve. Output is 0..1.
const DISSOLVE_GLSL = /* glsl */ `
  varying vec3 vObjPos;
  uniform float uReveal;
  uniform float uSweepHalf;
  uniform float uSweepCenter;
  uniform vec3 uEdgeColor;

  float rHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float rNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(rHash(i + vec3(0, 0, 0)), rHash(i + vec3(1, 0, 0)), f.x),
          mix(rHash(i + vec3(0, 1, 0)), rHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(rHash(i + vec3(0, 0, 1)), rHash(i + vec3(1, 0, 1)), f.x),
          mix(rHash(i + vec3(0, 1, 1)), rHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // Noise mixed with a bottom-to-top sweep, so the surface "resolves" upward.
  float revealField(vec3 p) {
    float n = rNoise(p * 2.3) * 0.62 + rNoise(p * 5.7) * 0.38;
    float sweep = clamp((p.y - uSweepCenter + uSweepHalf) / (2.0 * uSweepHalf), 0.0, 1.0);
    return clamp(n * 0.5 + sweep * 0.5, 0.0, 1.0);
  }
`;

function patchShader(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec3 vObjPos;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObjPos = position;");

  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\n${DISSOLVE_GLSL}`)
    // Discard everything the dissolve has not reached yet.
    .replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>
       float rField = revealField(vObjPos);
       if (rField > uReveal) discard;`
    )
    // A thin glowing accent edge along the dissolve front.
    .replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
       float rEdge = 1.0 - smoothstep(0.0, 0.045, uReveal - rField);
       totalEmissiveRadiance += uEdgeColor * rEdge * step(uReveal, 1.0) * 4.0;`
    );
}

/**
 * @param {object} opts
 * @param {THREE.Color} opts.color      starting (clay) colour
 * @param {THREE.Color} opts.edgeColor  colour of the dissolve edge
 * @param {THREE.Texture} [opts.envMap]
 * @param {number} [opts.sweepHalf]     half the object's height, for the upward sweep
 * @param {boolean} [opts.flatShading]  faceted look for shards
 * @returns {{ material: THREE.MeshPhysicalMaterial, uniforms: object }}
 */
export function createRenderMaterial({ color, edgeColor, envMap = null, sweepHalf = 1.9, flatShading = false }) {
  const uniforms = {
    uReveal: { value: 0 },
    uSweepHalf: { value: sweepHalf },
    uSweepCenter: { value: 0 },
    uEdgeColor: { value: edgeColor.clone() },
  };

  const material = new THREE.MeshPhysicalMaterial({
    color: color.clone(),
    roughness: 0.92,
    metalness: 0,
    envMap,
    envMapIntensity: 0,
    flatShading,
    // Start these just above zero so their shader code is compiled up front.
    // Crossing from 0 to >0 later would trigger a recompile and a visible hitch.
    clearcoat: 0.0001,
    clearcoatRoughness: 0.12,
    iridescence: 0.0001,
    iridescenceIOR: 1.45,
    iridescenceThicknessRange: [180, 820],
  });

  material.onBeforeCompile = (shader) => patchShader(shader, uniforms);
  material.customProgramCacheKey = () => "render-dissolve";

  return { material, uniforms };
}

// Texture blending for real models: at uFinish = 0 the colour, roughness and
// metal maps are ignored (flat clay); at 1 they are fully applied. Normal and
// AO maps stay on throughout, so the clay pass still shows the sculpted detail.
const FINISH_CHUNKS = {
  "#include <map_fragment>": /* glsl */ `
    #ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, uFinish );
    #endif`,
  "#include <roughnessmap_fragment>": /* glsl */ `
    float roughnessFactor = roughness;
    #ifdef USE_ROUGHNESSMAP
      vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
      roughnessFactor *= mix( 1.0, texelRoughness.g, uFinish );
    #endif`,
  "#include <metalnessmap_fragment>": /* glsl */ `
    float metalnessFactor = metalness;
    #ifdef USE_METALNESSMAP
      vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
      metalnessFactor *= mix( 1.0, texelMetalness.b, uFinish );
    #endif`,
};

const lerp = (a, b, t) => a + (b - a) * t;
const BLACK = new THREE.Color(0, 0, 0);

/**
 * The render material for a real, textured model (a GLB's own material).
 * Same dissolve as createRenderMaterial; set() blends from clay to the
 * model's own look.
 *
 * @param {THREE.MeshStandardMaterial} original  the material from the GLB
 * @param {object} opts
 * @param {THREE.Color} opts.clay        clay colour
 * @param {THREE.Color} opts.edgeColor   dissolve edge colour
 * @param {THREE.Texture} [opts.envMap]
 * @param {number} opts.sweepCenter      geometry-space centre height, for the upward sweep
 * @param {number} opts.sweepHalf        geometry-space half height
 */
export function createTexturedRenderMaterial(original, { clay, edgeColor, envMap = null, sweepCenter = 0, sweepHalf = 1 }) {
  const material = original.clone();
  const orig = {
    color: original.color.clone(),
    roughness: original.roughness,
    metalness: original.metalness,
    emissive: original.emissive?.clone() ?? BLACK.clone(),
  };
  material.envMap = envMap;
  material.envMapIntensity = 0;

  const uniforms = {
    uReveal: { value: 0 },
    uSweepHalf: { value: sweepHalf },
    uSweepCenter: { value: sweepCenter },
    uEdgeColor: { value: edgeColor.clone() },
    uFinish: { value: 0 },
  };

  material.onBeforeCompile = (shader) => {
    patchShader(shader, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uFinish;");
    for (const [chunk, code] of Object.entries(FINISH_CHUNKS)) {
      shader.fragmentShader = shader.fragmentShader.replace(chunk, code);
    }
  };
  material.customProgramCacheKey = () => "render-dissolve-textured";

  /** finish 0..1 (clay -> own look); rough/metal are the clay-side values for this pass. */
  function set({ reveal, finish, rough, metal, env }) {
    uniforms.uReveal.value = reveal;
    uniforms.uFinish.value = finish;
    material.color.lerpColors(clay, orig.color, finish);
    material.roughness = lerp(rough, orig.roughness, finish);
    material.metalness = lerp(Math.min(metal, 0.2), orig.metalness, finish);
    material.emissive.lerpColors(BLACK, orig.emissive, finish);
    material.envMapIntensity = env;
  }

  return { material, uniforms, set };
}

/** Additive glowing lines for the wireframe pass. */
export function createWireMaterial(color, { fog = false } = {}) {
  return new THREE.LineBasicMaterial({
    color: color.clone().multiplyScalar(1.25),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog,
  });
}
