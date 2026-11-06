/**
 * 3D turntable: loads a GLB and lets the viewer orbit it.
 *
 * - Auto-rotates until the viewer grabs it, then stays where they left it
 *   (the Auto-rotate button turns it back on).
 * - Shading buttons swap Wireframe / Clay / Material, echoing the passes.
 * - Horizontal drags orbit; vertical swipes still scroll the page on touch.
 *   Wheel zoom is off so the page never gets stuck scrolling inside it.
 * - Renders only while on screen and while the tab is visible.
 *
 * - Loads Draco- and Meshopt-compressed GLBs (decoders fetched only if the
 *   file needs them). The placeholder models are Meshopt-compressed.
 *
 * This module (and Three.js) is only imported when the section is near.
 */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const FIT_RADIUS = 2.2;

// Draco decoder files live on the same CDN as Three.js; they only download
// when a model actually uses Draco compression.
const DRACO_PATH = "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/";

export function initTurntable(section, { src, alt = "", reducedMotion = false, lite = false }) {
  const stage = section.querySelector("[data-tt-stage]");
  const canvas = section.querySelector("[data-tt-canvas]");
  const status = section.querySelector("[data-tt-status]");
  const rotateBtn = section.querySelector("[data-tt-rotate]");
  const shadeButtons = [...section.querySelectorAll("[data-tt-shade]")];
  const css = getComputedStyle(document.documentElement);
  const bg = new THREE.Color(css.getPropertyValue("--bg-raised").trim() || "#111317");
  // Wireframes keep the site render colour (project pages override --accent).
  const accent = new THREE.Color(css.getPropertyValue("--render-accent").trim() || "#f26b38");
  const clay = new THREE.Color(css.getPropertyValue("--clay").trim() || "#b8b1a6");

  // ---- Renderer, scene, camera ---------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lite ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = !lite; // soft shadows are the first thing to go on phones
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = bg;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 100);
  camera.position.set(4.2, 2.4, 5.6);

  const key = new THREE.DirectionalLight(0xfff0e0, 2);
  key.position.set(-4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  key.shadow.bias = -0.0005;
  key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xa9bcff, 1.6);
  rim.position.set(4, 3, -5);
  scene.add(key, rim, new THREE.HemisphereLight(0xe6ebff, 0x1b1813, 0.25));

  // Invisible floor that only shows the model's soft shadow.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.35 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- Controls ------------------------------------------------------------
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // never go under the floor
  canvas.style.touchAction = "pan-y"; // vertical swipes keep scrolling the page

  function setAutoRotate(on) {
    controls.autoRotate = on;
    rotateBtn.setAttribute("aria-pressed", String(on));
  }
  setAutoRotate(controls.autoRotate);
  controls.addEventListener("start", () => {
    setAutoRotate(false);
    stage.classList.add("is-touched");
  });
  rotateBtn.addEventListener("click", () => setAutoRotate(!controls.autoRotate));

  // ---- Shading modes ---------------------------------------------------------
  const originals = new Map();
  // Semi-transparent so dense meshes still read as wires, not a solid mass.
  const wireMat = new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false });
  const clayMat = new THREE.MeshStandardMaterial({ color: clay, roughness: 0.92 });
  let model = null;

  function setShade(mode) {
    shadeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ttShade === mode)));
    if (!model) return;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = mode === "wireframe" ? wireMat : mode === "clay" ? clayMat : originals.get(o);
      o.castShadow = mode !== "wireframe";
    });
    floor.visible = mode !== "wireframe";
  }
  shadeButtons.forEach((b) => b.addEventListener("click", () => setShade(b.dataset.ttShade)));

  // ---- Load the model ---------------------------------------------------------
  if (alt) canvas.setAttribute("aria-label", `${alt}. Drag sideways to turn it.`);
  status.textContent = "Loading model";
  const loader = new GLTFLoader();
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_PATH));
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    src,
    (gltf) => {
      model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          originals.set(o, o.material);
          o.castShadow = o.receiveShadow = true;
        }
      });

      // Centre it, sit it on the floor, and scale it to a common size.
      const box = new THREE.Box3().setFromObject(model);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const s = FIT_RADIUS / sphere.radius;
      model.scale.setScalar(s);
      box.setFromObject(model);
      const centre = box.getCenter(new THREE.Vector3());
      model.position.x -= centre.x;
      model.position.z -= centre.z;
      model.position.y -= box.min.y;
      scene.add(model);

      const height = box.max.y - box.min.y;
      controls.target.set(0, height * 0.45, 0);
      camera.position.set(3.5, height * 0.45 + 1.5, 4.7);
      controls.update();

      status.textContent = "";
      stage.classList.add("is-loaded");
    },
    (e) => {
      if (e.total) status.textContent = `Loading model ${Math.round((e.loaded / e.total) * 100)}%`;
    },
    (err) => {
      console.warn("[turntable]", err);
      status.textContent = "Model could not be loaded";
      stage.classList.add("is-error");
    }
  );

  // ---- Size + frame loop ------------------------------------------------------
  function layout() {
    const w = stage.clientWidth;
    const hgt = stage.clientHeight;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(stage);
  layout();

  let onScreen = false;
  let running = false;
  const tick = () => {
    controls.update();
    renderer.render(scene, camera);
  };
  function updateRunning() {
    const should = onScreen && !document.hidden;
    if (should !== running) {
      renderer.setAnimationLoop(should ? tick : null);
      running = should;
    }
  }
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    updateRunning();
  }).observe(stage);
  document.addEventListener("visibilitychange", updateRunning);
}
