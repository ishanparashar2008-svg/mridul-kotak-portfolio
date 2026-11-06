/**
 * Footer preview of the next project's object, as it appears in the void.
 * It idles as a wireframe; hovering (or focusing) the "Next project" link
 * renders it in (clay dissolve, then its final material), and leaving
 * drops it back to wireframe. Same material code as the void, and the same
 * Blender model when the project has a "worldModel" (the primitive stands in
 * until it loads, and stays if it fails).
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cssColor, createRenderMaterial, createWireMaterial } from "../render-material.js";
import { getShape } from "../shapes.js";
import { loadWorldModel } from "../world-model.js";

const FINISHES = {
  satin:      { rough: 0.42, metal: 0.1, coat: 0.6, irid: 0, env: 0.55 },
  metal:      { rough: 0.3,  metal: 1,   coat: 0.3, irid: 0, env: 1.0 },
  iridescent: { rough: 0.2,  metal: 1,   coat: 1,   irid: 1, env: 0.75 },
  glossy:     { rough: 0.12, metal: 0,   coat: 1,   irid: 0, env: 0.6 },
};

export function initNextPreview(canvas, project, { trigger, reducedMotion = false }) {
  // Opaque, painted in the page colour: additive wireframe lines do not
  // composite onto a transparent canvas.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = cssColor("--bg", "#0a0b0d");
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 6);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xe6ebff, 0x1b1813, 0.6));
  const key = new THREE.DirectionalLight(0xfff0e0, 1.8);
  key.position.set(-3, 4, 4);
  const rim = new THREE.DirectionalLight(0xa9bcff, 1.8);
  rim.position.set(3, 2, -4);
  scene.add(key, rim);

  const shape = getShape(project.shape);
  const clay = cssColor("--clay", "#b8b1a6");
  const accent = cssColor("--accent", "#f26b38");
  const siteAccent = cssColor("--render-accent", "#f26b38"); // wireframes keep the site render colour, as in the void
  const finalColor = new THREE.Color(project.accent || "#d4d2dc");
  const f = FINISHES[project.finish] || FINISHES.satin;

  const { material, uniforms } = createRenderMaterial({ color: clay, edgeColor: accent, envMap: env, sweepHalf: shape.sweepHalf, flatShading: shape.flat });
  const wireMat = createWireMaterial(siteAccent);
  const mesh = new THREE.Mesh(shape.surface, material);
  const lines = new THREE.LineSegments(shape.wire, wireMat);
  const spinner = new THREE.Group();
  spinner.add(mesh, lines);
  spinner.rotation.set(project.worldModel ? 0.15 : 0.4, 0.6, 0);
  scene.add(spinner);

  let model = null;
  if (project.worldModel) {
    loadWorldModel(project.worldModel, { clay, edgeColor: accent, envMap: env })
      .then((m) => {
        spinner.remove(mesh, lines);
        material.dispose();
        model = m;
        lines.geometry = m.wire;
        spinner.add(m.group, lines);
        apply();
      })
      .catch((err) => console.warn(`[next] ${project.worldModel} could not be loaded; keeping the primitive.`, err));
  }

  // 0 = wireframe, 1 = fully rendered. `target` flips on hover; `t` eases toward it.
  let t = 0;
  let target = 0;
  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  function apply() {
    const reveal = clamp01(t / 0.6) * 1.02;          // dissolve in over the first 60%
    const finish = clamp01((t - 0.45) / 0.55);        // then blend to the final look
    wireMat.opacity = 0.85 * (1 - clamp01((t - 0.2) / 0.5));
    lines.visible = wireMat.opacity > 0.01;
    if (model) {
      model.group.visible = reveal > 0.001;
      model.parts.forEach((p) => p.set({ reveal, finish, rough: 0.92, metal: 0, env: lerp(0.04, 0.6, finish) }));
      return;
    }
    uniforms.uReveal.value = reveal;
    mesh.visible = reveal > 0.001;
    material.color.lerpColors(clay, finalColor, finish);
    material.roughness = lerp(0.92, f.rough, finish);
    material.metalness = lerp(0, f.metal, finish);
    material.clearcoat = Math.max(lerp(0, f.coat, finish), 0.0001);
    material.iridescence = Math.max(lerp(0, f.irid, finish), 0.0001);
    material.envMapIntensity = lerp(0.04, f.env, finish);
  }
  apply();

  const on = () => (target = 1);
  const off = () => (target = 0);
  trigger.addEventListener("pointerenter", on);
  trigger.addEventListener("pointerleave", off);
  trigger.addEventListener("focus", on);
  trigger.addEventListener("blur", off);
  // Touch screens cannot hover: render it once it is on screen instead.
  if (!window.matchMedia("(hover: hover)").matches) target = 1;

  function layout() {
    const w = canvas.clientWidth;
    const hgt = canvas.clientHeight;
    renderer.setSize(w, hgt, false);
    camera.aspect = w / hgt;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(layout).observe(canvas);
  layout();

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!reducedMotion) spinner.rotation.y += dt * 0.35;
    // Rendering in is slower than falling back to wireframe.
    const speed = target > t ? 0.9 : 1.8;
    t = reducedMotion ? target : t + Math.sign(target - t) * Math.min(Math.abs(target - t), dt * speed);
    apply();
    renderer.render(scene, camera);
  }

  let running = false;
  let onScreen = false;
  function updateRunning() {
    const should = onScreen && !document.hidden;
    if (should !== running) {
      if (should) clock.getDelta();
      renderer.setAnimationLoop(should ? tick : null);
      running = should;
    }
  }
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    updateRunning();
  }).observe(canvas);
  document.addEventListener("visibilitychange", updateRunning);
}
