/**
 * Hero 3D scene: a sculpture floating in the void. Either a real model
 * (artist.heroModels in projects.json) or, as a fallback, a torus knot.
 *
 * Real models load in two steps so the first frame is never held up:
 *   1. <name>-wire.glb (tiny, untextured, simplified) for the wireframe pass,
 *      loaded during the page loader.
 *   2. <name>.glb (textured, Meshopt-compressed) streams in while the
 *      wireframe draws on. If it is not ready when clay is due, the intro
 *      holds on the wireframe until it is.
 *
 * The "render" is four passes, each a set of numeric targets that GSAP
 * tweens between (see MODES):
 *   wireframe  glowing accent-coloured edges, drawn on progressively
 *   clay       the surface dissolves in (noise + sweep) as matte clay
 *   lit        key + rim lights and a soft contact shadow come up
 *   final      metal, clearcoat and iridescence, lit mostly by the cursor
 *
 * One MeshPhysicalMaterial does clay, lit and final by tweening its
 * properties, so there is no transparent crossfade (and no sorting
 * artefacts). The dissolve lives in render-material.js, shared with the
 * project world.
 *
 * Performance: pixel ratio capped at 2, rendering stops when the tab is
 * hidden or the canvas is scrolled out of view.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { cssColor, createRenderMaterial, createTexturedRenderMaterial, createWireMaterial } from "./render-material.js";
import { lite, maxPixelRatio } from "./device.js";

export const MODE_ORDER = ["wireframe", "clay", "lit", "final"];

// Target values for each pass. `finish` blends clay colour to final colour.
const MODES = {
  wireframe: { reveal: 0,    wire: 1, hemi: 0.6,  key: 0,   rim: 0,   cursor: 0,   shadow: 0,    rough: 0.92, metal: 0, coat: 0, irid: 0, env: 0,    finish: 0 },
  clay:      { reveal: 1.02, wire: 0, hemi: 2.4,  key: 0.5, rim: 0,   cursor: 0,   shadow: 0.12, rough: 0.92, metal: 0, coat: 0, irid: 0, env: 0,    finish: 0 },
  lit:       { reveal: 1.02, wire: 0, hemi: 0.08, key: 2.2, rim: 1.8, cursor: 0.6, shadow: 0.55, rough: 0.62, metal: 0, coat: 0, irid: 0, env: 0.04, finish: 0 },
  final:     { reveal: 1.02, wire: 0, hemi: 0.02, key: 0.3, rim: 2.4, cursor: 1,   shadow: 0.3,  rough: 0.22, metal: 1, coat: 1, irid: 1, env: 0.16, finish: 1 },
};

const CURSOR_LIGHT_MAX = 60;   // point light intensity at full strength (candela)
const LIGHT_PLANE_Z = 2.3;     // the cursor light slides on this plane in front of the object
const FIT_RADIUS = 2.1;        // every hero object is scaled to this bounding radius (the knot's size)
const MODEL_ENV = 2.2;         // real textured models take more studio reflection than the knot

export function createScene(canvas, { reducedMotion = false, models = [] } = {}) {
  const model = models.find((m) => m && m.src) || null; // one model for now
  const useModel = Boolean(model);
  // ---------------------------------------------------------------------
  // Renderer, scene, camera
  // ---------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(maxPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const bg = cssColor("--bg", "#0a0b0d");
  const accent = cssColor("--accent", "#f26b38");
  const clayColor = cssColor("--clay", "#b8b1a6");
  const finalColor = new THREE.Color("#d4d2dc"); // pale metal; iridescence adds the colour

  const scene = new THREE.Scene();
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, 0.045);

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 0, 9.5);

  // Soft studio reflections for the final metal pass. Assigned to the material
  // (not scene.environment) so material.envMapIntensity can tween it.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ---------------------------------------------------------------------
  // Object hierarchy: rig (layout) > floater (bob) > spinner (rotation)
  // ---------------------------------------------------------------------
  const rig = new THREE.Group();
  const floater = new THREE.Group();
  const spinner = new THREE.Group();
  rig.add(floater);
  floater.add(spinner);
  scene.add(rig);

  // Half height / half width the layout fits on screen (the knot's by default;
  // replaced by the model's real proportions once it loads).
  let fit = { halfH: FIT_RADIUS, halfW: FIT_RADIUS };

  // Wireframe pass: additive glowing lines, drawn on progressively.
  const wireMat = createWireMaterial(accent);
  let wireGeo = new THREE.BufferGeometry();
  let wireCount = 0;
  const wire = new THREE.LineSegments(wireGeo, wireMat);

  // Knot mode
  let surface = null;
  let surfaceMat = null;
  let uniforms = null;

  // Model mode
  const modelRoot = new THREE.Group(); // holds the normalising transform
  const modelParts = [];               // { mesh, set } per textured mesh
  let fullLoaded = !useModel;

  if (!useModel) {
    const KNOT = { radius: 1.1, tube: 0.36, p: 2, q: 3 };
    // Lite mode (phones, low-power devices): about a quarter of the triangles.
    const surfaceGeo = lite
      ? new THREE.TorusKnotGeometry(KNOT.radius, KNOT.tube, 160, 28, KNOT.p, KNOT.q)
      : new THREE.TorusKnotGeometry(KNOT.radius, KNOT.tube, 320, 56, KNOT.p, KNOT.q);
    ({ material: surfaceMat, uniforms } = createRenderMaterial({
      color: clayColor,
      edgeColor: accent,
      envMap: envTexture,
      sweepHalf: 1.9,
    }));
    surface = new THREE.Mesh(surfaceGeo, surfaceMat);
    surface.castShadow = true;
    surface.receiveShadow = true;
    spinner.add(surface);

    wireGeo = new THREE.WireframeGeometry(
      new THREE.TorusKnotGeometry(KNOT.radius, KNOT.tube * 1.004, lite ? 110 : 150, lite ? 12 : 16, KNOT.p, KNOT.q)
    );
    wire.geometry = wireGeo;
    wireCount = wireGeo.attributes.position.count;
    spinner.add(wire);
  } else {
    spinner.add(modelRoot);
    modelRoot.add(wire);
  }

  // ---------------------------------------------------------------------
  // Void dressing: faint dust for depth, and an invisible floor that only
  // catches the soft shadow.
  // ---------------------------------------------------------------------
  const DUST = lite ? 160 : 420;
  const dustPos = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 34;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 20;
    dustPos[i * 3 + 2] = -Math.random() * 26 + 3;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x8b8d92, size: 0.03, sizeAttenuation: true, transparent: true, opacity: 0.45, depthWrite: false })
  );
  scene.add(dust);

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0, color: 0x000000 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), shadowMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------------------------------------------------------------------
  // Lights
  // ---------------------------------------------------------------------
  // "Solid viewport" fill for the clay pass; almost off in the final look.
  const hemi = new THREE.HemisphereLight(0xe6ebff, 0x1b1813, 0.6);
  scene.add(hemi);

  // Key light with soft shadows.
  const key = new THREE.DirectionalLight(0xfff0e0, 0);
  key.position.set(-4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(lite ? 512 : 1024, lite ? 512 : 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -5;
  key.shadow.camera.right = 5;
  key.shadow.camera.top = 5;
  key.shadow.camera.bottom = -5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  scene.add(key, key.target);

  // Cool rim from behind to carve the silhouette out of the void.
  const rim = new THREE.DirectionalLight(0xa9bcff, 0);
  rim.position.set(4, 3, -6);
  scene.add(rim, rim.target);

  // The cursor light.
  const cursorLight = new THREE.PointLight(0xfff2e8, 0, 14, 2);
  scene.add(cursorLight);

  // ---------------------------------------------------------------------
  // State + applying it
  // ---------------------------------------------------------------------
  const state = { ...MODES.wireframe, wire: 0 };
  const wireDraw = { t: 1 }; // 0..1 of the wireframe drawn on

  function apply() {
    if (useModel) {
      for (const part of modelParts) {
        part.set({ reveal: state.reveal, finish: state.finish, rough: state.rough, metal: state.metal, env: state.env * MODEL_ENV });
        part.mesh.visible = state.reveal > 0.001;
      }
    } else {
      uniforms.uReveal.value = state.reveal;
      surface.visible = state.reveal > 0.001;
    }

    // Until the full model arrives, the wireframe stands in for every pass.
    const waiting = !fullLoaded && state.reveal > 0.001;
    wireMat.opacity = waiting ? 1 : state.wire;
    wire.visible = wireMat.opacity > 0.001;
    wireGeo.setDrawRange(0, Math.floor(wireDraw.t * wireCount / 2) * 2);

    hemi.intensity = state.hemi;
    key.intensity = state.key;
    rim.intensity = state.rim;
    cursorLight.intensity = state.cursor * CURSOR_LIGHT_MAX;
    shadowMat.opacity = state.shadow;

    if (surfaceMat) {
      surfaceMat.roughness = state.rough;
      surfaceMat.metalness = state.metal;
      surfaceMat.clearcoat = Math.max(state.coat, 0.0001);
      surfaceMat.iridescence = Math.max(state.irid, 0.0001);
      surfaceMat.envMapIntensity = state.env;
      surfaceMat.color.lerpColors(clayColor, finalColor, state.finish);
    }
  }
  apply();

  // ---------------------------------------------------------------------
  // Model loading (model mode only)
  // ---------------------------------------------------------------------
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);
  let resolveFull;
  const fullReady = new Promise((r) => (resolveFull = r));

  /** Step 1: the light wireframe copy. Sets the scale every pass shares. */
  async function loadWire() {
    const gltf = await gltfLoader.loadAsync(model.wire || model.src);
    const root = gltf.scene;
    root.updateMatrixWorld(true);

    // Centre the model and scale it to the knot's footprint.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
    const s = FIT_RADIUS / radius;
    modelRoot.scale.setScalar(s);
    modelRoot.position.copy(centre).multiplyScalar(-s);
    fit = { halfH: (size.y / 2) * s, halfW: (Math.hypot(size.x, size.z) / 2) * s };

    // One merged line geometry, so the draw-on runs across the whole model.
    const chunks = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const w = new THREE.WireframeGeometry(o.geometry);
      w.applyMatrix4(o.matrixWorld);
      chunks.push(w.attributes.position.array);
      w.dispose();
    });
    const merged = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
      merged.set(c, offset);
      offset += c.length;
    }
    wireGeo.dispose();
    wireGeo = new THREE.BufferGeometry();
    wireGeo.setAttribute("position", new THREE.BufferAttribute(merged, 3));
    wire.geometry = wireGeo;
    wireCount = merged.length / 3;
    layout();
    apply();
  }

  /** Step 2: the textured model, streamed in behind the wireframe. */
  async function loadFull() {
    try {
      const gltf = await gltfLoader.loadAsync(model.src);
      const root = gltf.scene;
      const meshes = [];
      root.traverse((o) => o.isMesh && meshes.push(o));

      // One upward sweep across the whole model (parts share a geometry space).
      const span = new THREE.Box3();
      meshes.forEach((m) => {
        m.geometry.computeBoundingBox();
        span.union(m.geometry.boundingBox);
      });
      const sweepCenter = (span.min.y + span.max.y) / 2;
      const sweepHalf = (span.max.y - span.min.y) / 2 + 0.02;

      for (const mesh of meshes) {
        const { material, set } = createTexturedRenderMaterial(mesh.material, {
          clay: clayColor,
          edgeColor: accent,
          envMap: envTexture,
          sweepCenter,
          sweepHalf,
        });
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        modelParts.push({ mesh, set });
      }
      modelRoot.add(root);
      apply();
      // Compile the new shaders before the first pass needs them (no hitch).
      await renderer.compileAsync(scene, camera);
      fullLoaded = true;
      apply();
    } catch (err) {
      console.warn("[hero] model could not be loaded; staying on the wireframe.", err);
    }
    resolveFull();
  }

  const wireReady = useModel
    ? loadWire().catch((err) => console.warn("[hero] wireframe model could not be loaded.", err))
    : Promise.resolve();
  if (useModel) wireReady.then(loadFull);
  else resolveFull();

  let activeTween = null;

  /** Tween to a pass. duration 0 = jump. Returns the GSAP tween (or null). */
  function setMode(mode, { duration = 1.2 } = {}) {
    const target = MODES[mode];
    if (!target) return null;
    activeTween?.kill();
    wireDraw.t = 1;
    if (duration <= 0) {
      Object.assign(state, target);
      apply();
      return null;
    }
    activeTween = gsap.to(state, { ...target, duration, ease: "power2.inOut", onUpdate: apply });
    return activeTween;
  }

  /**
   * The intro "render": wireframe draws on, clay dissolves in, lights come
   * up, then the final material. Calls onStage(mode) as each pass begins.
   */
  function playIntro({ onStage = () => {}, onComplete = () => {} } = {}) {
    activeTween?.kill();
    Object.assign(state, MODES.wireframe, { wire: 0 });
    wireDraw.t = 0;
    apply();
    spinner.scale.setScalar(0.94);

    // Clay targets minus the wire fade, which gets its own slower tween below.
    const { wire: _unused, ...clayTargets } = MODES.clay;

    const tl = gsap.timeline({ onComplete });
    tl.call(() => onStage("wireframe"), null, 0)
      .to(state, { wire: 1, duration: 0.5, ease: "power1.out", onUpdate: apply }, 0)
      .to(wireDraw, { t: 1, duration: 1.8, ease: "power2.inOut", onUpdate: apply }, 0)
      .to(spinner.scale, { x: 1, y: 1, z: 1, duration: 2.4, ease: "expo.out" }, 0)

      // Model still downloading? Hold on the wireframe until it lands.
      .add(() => {
        if (!fullLoaded) {
          tl.pause();
          fullReady.then(() => tl.resume());
        }
      }, 2.05)
      .call(() => onStage("clay"), null, 2.1)
      .to(state, { ...clayTargets, duration: 1.7, ease: "power1.inOut", onUpdate: apply }, 2.1)
      .to(state, { wire: 0, duration: 1.2, ease: "power1.in", onUpdate: apply }, 2.7)

      .call(() => onStage("lit"), null, 4.4)
      .to(state, { ...MODES.lit, duration: 1.4, ease: "power2.inOut", onUpdate: apply }, 4.4)

      .call(() => onStage("final"), null, 6.3)
      .to(state, { ...MODES.final, duration: 2, ease: "power2.inOut", onUpdate: apply }, 6.3);

    activeTween = tl;
    return tl;
  }

  // ---------------------------------------------------------------------
  // Cursor light
  // ---------------------------------------------------------------------
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const raycaster = new THREE.Raycaster();
  const lightPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -LIGHT_PLANE_Z);
  const ndc = new THREE.Vector2();
  const lightTarget = new THREE.Vector3();
  const pointer = { x: 0, y: 0, active: false };

  /** nx, ny in normalised device coords (-1..1, y up). */
  function setPointer(nx, ny) {
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }

  function updateLightTarget(time) {
    if (pointer.active) {
      ndc.set(pointer.x, pointer.y);
      raycaster.setFromCamera(ndc, camera);
      raycaster.ray.intersectPlane(lightPlane, lightTarget);
    } else if (!finePointer && !reducedMotion) {
      // Touch devices: the light drifts slowly around the object on its own.
      lightTarget.set(
        rig.position.x + Math.cos(time * 0.35) * 2.1,
        rig.position.y + Math.sin(time * 0.47) * 1.5,
        LIGHT_PLANE_Z
      );
    } else {
      // Resting spot: upper left, in front. Flattering before the mouse moves.
      lightTarget.set(rig.position.x - 1.5, rig.position.y + 1.4, LIGHT_PLANE_Z);
    }
  }

  // ---------------------------------------------------------------------
  // Layout: object to the right on wide screens, centred above the type on tall ones
  // ---------------------------------------------------------------------
  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();

    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = halfH * camera.aspect;
    // Fit the object (knot, or the model's real proportions) to the space it gets.
    if (camera.aspect >= 1.05) {
      rig.position.set(halfW * 0.36, halfH * 0.06, 0);
      rig.scale.setScalar(Math.min((halfH * 0.66) / fit.halfH, (halfW * 0.5) / fit.halfW));
    } else {
      // Tall screens: sit in the gap between the shading buttons and the name.
      rig.position.set(0, halfH * (useModel ? 0.32 : 0.3), 0);
      rig.scale.setScalar(Math.min((halfH * (useModel ? 0.36 : 0.42)) / fit.halfH, (halfW * 0.8) / fit.halfW));
    }
    floor.position.y = rig.position.y - (fit.halfH + 0.25) * rig.scale.x;
    key.target.position.copy(rig.position);
    rim.target.position.copy(rig.position);
    if (!pointer.active) cursorLight.position.set(rig.position.x - 1.5, rig.position.y + 1.4, LIGHT_PLANE_Z);
  }

  // ---------------------------------------------------------------------
  // Render loop (paused when hidden or scrolled away)
  // ---------------------------------------------------------------------
  const clock = new THREE.Clock();
  let time = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    if (!reducedMotion) {
      spinner.rotation.y += dt * 0.16;
      // Models stay upright like a turntable; the knot tumbles a little.
      spinner.rotation.x = useModel ? 0 : 0.35 + Math.sin(time * 0.21) * 0.22;
      floater.position.y = Math.sin(time * 0.7) * 0.09;
      dust.rotation.y += dt * 0.008;

      // A touch of camera parallax with the pointer.
      const px = pointer.active ? pointer.x : 0;
      const py = pointer.active ? pointer.y : 0;
      camera.position.x += (px * 0.35 - camera.position.x) * (1 - Math.exp(-dt * 2));
      camera.position.y += (py * 0.22 - camera.position.y) * (1 - Math.exp(-dt * 2));
      camera.lookAt(0, 0, 0);
    }

    updateLightTarget(time);
    const follow = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    cursorLight.position.lerp(lightTarget, follow);

    renderer.render(scene, camera);
  }

  let running = false;
  let pageVisible = !document.hidden;
  let onScreen = true;

  function updateRunning() {
    const should = pageVisible && onScreen;
    if (should && !running) {
      clock.getDelta(); // drop the time spent paused
      renderer.setAnimationLoop(tick);
      running = true;
    } else if (!should && running) {
      renderer.setAnimationLoop(null);
      running = false;
    }
  }

  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    updateRunning();
  });
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    updateRunning();
  }).observe(canvas);

  let resizeRaf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  }).observe(canvas);

  layout();

  return {
    setMode,
    playIntro,
    setPointer,
    /** Compile shaders and draw one frame, so the first visible frame does not stutter. */
    warmUp() {
      const saved = state.reveal;
      state.reveal = 0.5; // make the surface visible so its program is compiled
      apply();
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      state.reveal = saved;
      apply();
    },
    start: updateRunning,
    /** Resolves once the wireframe copy is in (model mode) or immediately (knot). */
    wireReady,
    /** Resolves once the textured model is in (or failed). */
    fullReady,
  };
}
