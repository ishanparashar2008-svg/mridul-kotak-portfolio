/**
 * Hero 3D scene: three models on a carousel (see js/hero-rig.js).
 *
 * Passes, tweened with GSAP between the numeric targets in MODES:
 *   wireframe  glowing accent-coloured edges, drawn on progressively
 *   clay       the surface dissolves in as matte clay, lit by the cursor
 *   final      shown as pre-rendered PNGs (one per model, in js/hero.js),
 *              swept in over the live 3D behind a scanline. Without
 *              final PNGs the live 3D plays a final material instead.
 *
 * The canvas is transparent: each mode's environment is a PNG behind it.
 * The camera never moves and matches the PNGs' camera (coverFov), so the
 * live models sit exactly where the renders put them.
 *
 * Scroll turns the carousel (setCarousel, 0..1 = model 1 -> 2 -> 3); the
 * models slide round the circle without spinning on their own. Every frame
 * reports where each model is on screen (onFrame), which js/hero.js uses to
 * move the final PNGs with the 3D.
 *
 * A model is either a GLB (src, plus an optional light `wire` copy for the
 * wireframe pass) or a placeholder cube. Performance: pixel ratio capped,
 * the loop stops when the tab is hidden or the hero is scrolled away, and
 * WebGL drawing pauses while the final PNGs are showing.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { cssColor, createRenderMaterial, createTexturedRenderMaterial, createWireMaterial } from "./render-material.js";
import { lite, maxPixelRatio } from "./device.js";
import { HERO_RIG, slotPosition, scaleAt, focusAt, coverFov, startAngle } from "./hero-rig.js";

export const MODE_ORDER = ["wireframe", "clay", "final"];

// Target values for each pass. `finish` blends clay colour to the final look.
const MODES = {
  wireframe: { reveal: 0,    wire: 1, hemi: 0.6,  key: 0,   rim: 0,   cursor: 0, shadow: 0,    rough: 0.92, metal: 0, coat: 0, irid: 0, env: 0,    finish: 0 },
  clay:      { reveal: 1.02, wire: 0, hemi: 0.55, key: 1.1, rim: 1.4, cursor: 1, shadow: 0.5,  rough: 0.82, metal: 0, coat: 0, irid: 0, env: 0.03, finish: 0 },
  final:     { reveal: 1.02, wire: 0, hemi: 0.05, key: 0.5, rim: 2.2, cursor: 1, shadow: 0.35, rough: 0.22, metal: 1, coat: 1, irid: 1, env: 0.16, finish: 1 },
};

const CURSOR_LIGHT_MAX = 70;  // point light intensity at full strength (candela)
const LIGHT_PLANE_Z = 5.6;    // the cursor light slides on this plane, in front of the front slot
const MODEL_ENV = 2.2;        // real textured models take more studio reflection than the cubes
const STEP_DEG = 120;         // one scroll step turns the carousel one slot

export function createScene(canvas, { reducedMotion = false, models: configs = [], onFrame = () => {} } = {}) {
  // Three models; placeholder cubes stand in for any that are missing.
  const list = [0, 1, 2].map((i) => configs[i] || { name: `Model ${i + 1}`, shape: "cube" });

  // ---------------------------------------------------------------------
  // Renderer, scene, camera (transparent: the environment PNG shows through)
  // ---------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(maxPixelRatio());
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const accent = cssColor("--accent", "#f26b38");
  const clayColor = cssColor("--clay", "#b8b1a6");
  const finalColor = new THREE.Color("#d4d2dc");

  const scene = new THREE.Scene();
  const { camera: cam } = HERO_RIG;
  const camera = new THREE.PerspectiveCamera(cam.fov, 16 / 9, 0.1, 100);
  camera.position.set(...cam.position);
  camera.lookAt(new THREE.Vector3(...cam.target));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ---------------------------------------------------------------------
  // Lights + a floor that only shows shadows (the PNG behind is the real floor)
  // ---------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xe6ebff, 0x1b1813, 0.6);
  const key = new THREE.DirectionalLight(0xfff0e0, 0);
  key.position.set(-5, 9, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(lite ? 1024 : 2048, lite ? 1024 : 2048);
  Object.assign(key.shadow.camera, { near: 1, far: 30, left: -7, right: 7, top: 7, bottom: -7 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xa9bcff, 0);
  rim.position.set(5, 4, -7);
  const cursorLight = new THREE.PointLight(0xfff2e8, 0, 0, 2);
  scene.add(hemi, key, key.target, rim, rim.target, cursorLight);

  const shadowMat = new THREE.ShadowMaterial({ opacity: 0, color: 0x000000 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), shadowMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = HERO_RIG.floorY;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------------------------------------------------------------------
  // Models
  // ---------------------------------------------------------------------
  const gltfLoader = new GLTFLoader();
  gltfLoader.setMeshoptDecoder(MeshoptDecoder);

  const models = list.map((config, index) => {
    const root = new THREE.Group();   // position + scale on the carousel
    const fit = new THREE.Group();    // normalising transform (fit the box, stand on the floor)
    const turn = new THREE.Group();   // the model's own fixed facing
    turn.rotation.y = THREE.MathUtils.degToRad(config.rotation || 0);
    root.add(turn);
    turn.add(fit);
    scene.add(root);

    const wireMat = createWireMaterial(accent);
    const wire = new THREE.LineSegments(new THREE.BufferGeometry(), wireMat);
    fit.add(wire);

    return {
      index, config, root, fit, wire, wireMat,
      wireCount: 0,
      height: HERO_RIG.model.height, // fitted height in world units (set once the shape is known)
      cube: null,                    // { mesh, material, uniforms } for placeholders
      parts: [],                     // [{ mesh, set }] for GLB models
      fullLoaded: false,
      angle: startAngle(index),
      focus: 1,
    };
  });

  /** Scale `fit` so a box of `size` (centred on `centre`) fits the rig's model box, base on the floor. */
  function fitTo(m, size, centre) {
    const { height, width } = HERO_RIG.model;
    const s = Math.min(height / size.y, width / Math.max(size.x, size.z));
    m.fit.scale.setScalar(s);
    m.fit.position.set(-centre.x * s, -(centre.y - size.y / 2) * s, -centre.z * s);
    m.height = size.y * s;
  }

  function setWire(m, wireframeGeometries) {
    const merged = new Float32Array(wireframeGeometries.reduce((n, g) => n + g.attributes.position.array.length, 0));
    let offset = 0;
    for (const g of wireframeGeometries) {
      merged.set(g.attributes.position.array, offset);
      offset += g.attributes.position.array.length;
      g.dispose();
    }
    m.wire.geometry.dispose();
    m.wire.geometry = new THREE.BufferGeometry();
    m.wire.geometry.setAttribute("position", new THREE.BufferAttribute(merged, 3));
    m.wireCount = merged.length / 3;
  }

  /** Placeholder cube: built in place, nothing to download. */
  function buildCube(m) {
    fitTo(m, new THREE.Vector3(1, 1, 1), new THREE.Vector3(0, 0, 0));
    const { material, uniforms } = createRenderMaterial({ color: clayColor, edgeColor: accent, envMap: envTexture, sweepHalf: 0.52 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    m.fit.add(mesh);
    m.cube = { mesh, material, uniforms };
    setWire(m, [new THREE.WireframeGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004, 3, 3, 3))]);
    m.fullLoaded = true;
  }

  /** GLB step 1: the light wireframe copy. Sets the fit every pass shares. */
  async function loadWire(m) {
    const gltf = await gltfLoader.loadAsync(m.config.wire || m.config.src);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    fitTo(m, box.getSize(new THREE.Vector3()), box.getCenter(new THREE.Vector3()));
    const geos = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const w = new THREE.WireframeGeometry(o.geometry);
      w.applyMatrix4(o.matrixWorld);
      geos.push(w);
    });
    setWire(m, geos);
  }

  /** GLB step 2: the textured model, streamed in behind the wireframe. */
  async function loadFull(m) {
    const gltf = await gltfLoader.loadAsync(m.config.src);
    const meshes = [];
    gltf.scene.traverse((o) => o.isMesh && meshes.push(o));
    const span = new THREE.Box3();
    meshes.forEach((mesh) => {
      mesh.geometry.computeBoundingBox();
      span.union(mesh.geometry.boundingBox);
    });
    for (const mesh of meshes) {
      // A clone of the GLB's own material, with the dissolve and clay blend added.
      const { material, set } = createTexturedRenderMaterial(mesh.material, {
        clay: clayColor,
        edgeColor: accent,
        envMap: envTexture,
        sweepCenter: (span.min.y + span.max.y) / 2,
        sweepHalf: (span.max.y - span.min.y) / 2 + 0.02,
      });
      mesh.material = material;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      m.parts.push({ mesh, set });
    }
    m.fit.add(gltf.scene);
    m.fullLoaded = true;
  }

  // ---------------------------------------------------------------------
  // State + applying it
  // ---------------------------------------------------------------------
  const state = { ...MODES.wireframe, wire: 0 };
  const wireDraw = { t: 1 }; // 0..1 of the wireframe drawn on
  const intro = { scale: 1 };
  const carousel = { target: 0, current: 0 }; // in steps: 0, 1, 2

  function applyModel(m) {
    const dim = 0.45 + 0.55 * m.focus; // the back models sit in shade
    if (m.cube) {
      const { material, uniforms, mesh } = m.cube;
      uniforms.uReveal.value = state.reveal;
      mesh.visible = state.reveal > 0.001;
      material.roughness = state.rough;
      material.metalness = state.metal;
      material.clearcoat = Math.max(state.coat, 0.0001);
      material.iridescence = Math.max(state.irid, 0.0001);
      material.envMapIntensity = state.env;
      material.color.lerpColors(clayColor, finalColor, state.finish).multiplyScalar(dim);
    }
    for (const part of m.parts) {
      part.set({ reveal: state.reveal, finish: state.finish, rough: state.rough, metal: state.metal, env: state.env * MODEL_ENV });
      part.mesh.material.color.multiplyScalar(dim);
      part.mesh.visible = state.reveal > 0.001;
    }
    // Until a model's full version arrives, its wireframe stands in for every pass.
    const waiting = !m.fullLoaded && state.reveal > 0.001;
    m.wireMat.opacity = (waiting ? 1 : state.wire) * (0.4 + 0.6 * m.focus);
    m.wire.visible = m.wireMat.opacity > 0.001;
    m.wire.geometry.setDrawRange(0, Math.floor((wireDraw.t * m.wireCount) / 2) * 2);
  }

  function apply() {
    for (const m of models) applyModel(m);
    hemi.intensity = state.hemi;
    key.intensity = state.key;
    rim.intensity = state.rim;
    cursorLight.intensity = state.cursor * CURSOR_LIGHT_MAX;
    shadowMat.opacity = state.shadow;
  }

  /** Put every model where the carousel says, and report their screen positions. */
  const tmp = new THREE.Vector3();
  const forward = new THREE.Vector3();
  function placeModels() {
    camera.getWorldDirection(forward);
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    const project = (v) => {
      tmp.copy(v).project(camera);
      return { x: ((tmp.x + 1) / 2) * w, y: ((1 - tmp.y) / 2) * h };
    };
    const report = models.map((m) => {
      m.angle = startAngle(m.index) + STEP_DEG * carousel.current;
      m.focus = focusAt(m.angle);
      const scale = scaleAt(m.angle) * intro.scale;
      m.root.position.set(...slotPosition(m.angle));
      m.root.scale.setScalar(scale);

      // Where the model is now vs where its final PNG was rendered (front slot, full size).
      const now = new THREE.Vector3(...slotPosition(m.angle)).add(new THREE.Vector3(0, (m.height * scale) / 2, 0));
      const front = new THREE.Vector3(...slotPosition(0)).add(new THREE.Vector3(0, m.height / 2, 0));
      const depthNow = tmp.copy(now).sub(camera.position).dot(forward);
      const depthFront = tmp.copy(front).sub(camera.position).dot(forward);
      const a = project(front);
      const b = project(now);
      return {
        index: m.index,
        origin: a,                                  // anchor in the PNG's own framing
        dx: b.x - a.x,
        dy: b.y - a.y,
        scale: (depthFront / depthNow) * scaleAt(m.angle) * intro.scale,
        focus: m.focus,
        depth: depthNow,
      };
    });
    onFrame(report);
  }

  // ---------------------------------------------------------------------
  // Loading: cubes are instant; GLBs load their wireframe first
  // ---------------------------------------------------------------------
  const wireReady = Promise.all(
    models.map((m) => {
      if (!m.config.src) {
        buildCube(m);
        return Promise.resolve();
      }
      return loadWire(m).catch((err) => console.warn(`[hero] wireframe for "${m.config.name}" could not be loaded.`, err));
    })
  );
  const fullReady = wireReady
    .then(() =>
      Promise.all(
        models.map((m) =>
          m.fullLoaded ? null : loadFull(m).catch((err) => console.warn(`[hero] "${m.config.name}" could not be loaded; staying on the wireframe.`, err))
        )
      )
    )
    .then(async () => {
      apply();
      await renderer.compileAsync(scene, camera).catch(() => {});
    });

  wireReady.then(() => {
    apply();
    placeModels();
  });

  // ---------------------------------------------------------------------
  // Passes
  // ---------------------------------------------------------------------
  let activeTween = null;

  /** Tween to a pass. duration 0 = jump. Returns the GSAP tween (or null). */
  function setMode(mode, { duration = 1.2 } = {}) {
    const target = MODES[mode];
    if (!target) return null;
    activeTween?.kill();
    wireDraw.t = 1;
    intro.scale = 1;
    if (duration <= 0) {
      Object.assign(state, target);
      apply();
      return null;
    }
    activeTween = gsap.to(state, { ...target, duration, ease: "power2.inOut", onUpdate: apply });
    return activeTween;
  }

  /**
   * The intro "render": wireframe draws on, clay dissolves in (the cursor
   * light comes up with it), then the final look. onStage(mode) fires as
   * each pass begins.
   *
   * finalLook: false keeps the 3D in clay when the final pass begins (the
   * hero's final PNGs sweep in over it, so there is nothing to tween).
   */
  function playIntro({ onStage = () => {}, onComplete = () => {}, finalLook = true } = {}) {
    activeTween?.kill();
    Object.assign(state, MODES.wireframe, { wire: 0 });
    wireDraw.t = 0;
    intro.scale = 0.94;
    apply();

    const { wire: _unused, ...clayTargets } = MODES.clay;
    const allLoaded = () => models.every((m) => m.fullLoaded);

    const tl = gsap.timeline({ onComplete });
    // Timings (s): wireframe draws 0-1.0, clay dissolves in from 1.1, final at 2.5.
    tl.call(() => onStage("wireframe"), null, 0)
      .to(state, { wire: 1, duration: 0.35, ease: "power1.out", onUpdate: apply }, 0)
      .to(wireDraw, { t: 1, duration: 1.0, ease: "power2.inOut", onUpdate: apply }, 0)
      .to(intro, { scale: 1, duration: 1.6, ease: "expo.out" }, 0)

      // A model still downloading? Hold on the wireframe until it lands.
      .add(() => {
        if (!allLoaded()) {
          tl.pause();
          fullReady.then(() => tl.resume());
        }
      }, 1.05)
      .call(() => onStage("clay"), null, 1.1)
      .to(state, { ...clayTargets, duration: 1.1, ease: "power1.inOut", onUpdate: apply }, 1.1)
      .to(state, { wire: 0, duration: 0.8, ease: "power1.in", onUpdate: apply }, 1.4)

      .call(() => onStage("final"), null, 2.5);
    if (finalLook) tl.to(state, { ...MODES.final, duration: 1.4, ease: "power2.inOut", onUpdate: apply }, 2.5);
    else tl.to({}, { duration: 1.1 }, 2.5); // the hero's sweep runs here

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
  const front = new THREE.Vector3(...slotPosition(0));
  const rest = new THREE.Vector3(front.x - 1.8, 3.2, LIGHT_PLANE_Z); // upper left of the front model

  function setPointer(nx, ny) {
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }

  function updateLightTarget(time) {
    if (pointer.active) {
      ndc.set(pointer.x, pointer.y);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(lightPlane, lightTarget)) lightTarget.copy(rest);
    } else if (!finePointer && !reducedMotion) {
      // Touch devices: the light drifts slowly round the front model on its own.
      lightTarget.set(front.x + Math.cos(time * 0.35) * 2.4, 1.8 + Math.sin(time * 0.47) * 1.4, LIGHT_PLANE_Z);
    } else {
      lightTarget.copy(rest);
    }
  }
  cursorLight.position.copy(rest);

  // ---------------------------------------------------------------------
  // Layout: same framing as the PNGs at any window shape (cover)
  // ---------------------------------------------------------------------
  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = coverFov(camera.aspect);
    camera.updateProjectionMatrix();
    placeModels();
  }

  // ---------------------------------------------------------------------
  // Loop (paused when hidden or scrolled away; drawing paused while the
  // final PNGs cover the 3D)
  // ---------------------------------------------------------------------
  const clock = new THREE.Clock();
  let time = 0;
  let drawing = true;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;

    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    carousel.current += (carousel.target - carousel.current) * k;
    if (Math.abs(carousel.target - carousel.current) < 0.0005) carousel.current = carousel.target;
    placeModels();
    apply();

    updateLightTarget(time);
    // Fast follow: a hint of smoothing so it glides, but it keeps up with the system cursor.
    cursorLight.position.lerp(lightTarget, reducedMotion ? 1 : 1 - Math.exp(-dt * (pointer.active ? 32 : 6)));

    if (drawing) renderer.render(scene, camera);
  }

  let running = false;
  let pageVisible = !document.hidden;
  let onScreen = true;

  function updateRunning() {
    const should = pageVisible && onScreen;
    if (should && !running) {
      clock.getDelta();
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
    /** Scroll progress through the hero, 0..1 (model 1 at the front -> model 2 -> model 3). */
    setCarousel(progress, { instant = false } = {}) {
      carousel.target = Math.min(1, Math.max(0, progress)) * 2;
      if (instant) {
        carousel.current = carousel.target;
        placeModels();
      }
    },
    /** Stop drawing WebGL (the final PNGs cover it); positions keep updating. */
    setDrawing(on) {
      drawing = on;
    },
    /** Which models have no final PNG and need the live final material. */
    get models() {
      return list;
    },
    /** Compile shaders and draw one frame, so the first visible frame does not stutter. */
    warmUp() {
      const saved = state.reveal;
      state.reveal = 0.5;
      apply();
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
      state.reveal = saved;
      apply();
    },
    start: updateRunning,
    /** Resolves once every model's wireframe is in (cubes: immediately). */
    wireReady,
    /** Resolves once every model is fully loaded (or failed). */
    fullReady,
  };
}
