/**
 * The project world: every project is a floating object in the void.
 *
 * - Each project shows its own Blender model when it has a "worldModel"
 *   (world-model.js), or a primitive from its "shape" field. The primitive
 *   also stands in while the model loads, and stays if it fails to load.
 *   Models turn upright like a turntable; primitives tumble.
 * - The camera rides a CatmullRom curve. Scroll progress (0..1) comes in
 *   from work.js via setProgress(); the camera eases toward it here.
 * - Each object stays a wireframe until the camera is near, then renders:
 *   dissolve in as clay, then blend to its final material. It drops back to
 *   wireframe once the camera is far away again.
 * - Hover lights an object up and shows its label; click flies into it.
 *
 * No scroll or DOM-layout logic lives here; see work.js for that.
 */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { gsap } from "gsap";
import { cssColor, createRenderMaterial, createWireMaterial } from "./render-material.js";
import { getShape, disposeShapes } from "./shapes.js";
import { loadWorldModel } from "./world-model.js";
import { maxPixelRatio } from "./device.js";

// Final looks a project can ask for with its optional "finish" field.
const FINISHES = {
  satin:      { rough: 0.42, metal: 0.1, coat: 0.6, irid: 0, env: 0.55 },
  metal:      { rough: 0.3,  metal: 1,   coat: 0.3, irid: 0, env: 1.0 },
  iridescent: { rough: 0.2,  metal: 1,   coat: 1,   irid: 1, env: 0.75 },
  glossy:     { rough: 0.12, metal: 0,   coat: 1,   irid: 0, env: 0.6 },
};
const CLAY = { rough: 0.92, metal: 0, coat: 0, irid: 0, env: 0.04 };

const SPACING = 15;      // world units between projects along the path
const AHEAD = 6.5;       // an object sits this far past its scroll stop
const LATERAL = 2.1;     // sideways offset from the path, alternating left/right
const RENDER_NEAR = 12;  // camera closer than this: render
const RENDER_FAR = 18;   // camera further than this: back to wireframe
const HOVER_RANGE = 30;  // objects further than this cannot be hovered

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function createWorld(canvas, {
  projects,
  reducedMotion = false,
  labelEl,             // DOM label that follows the hovered object
  onActiveChange = () => {},
  onHoverChange = () => {},
  onFlyStart = () => {},
}) {
  const n = projects.length;

  // ---------------------------------------------------------------------
  // Renderer, scene, camera
  // ---------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(maxPixelRatio());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const bg = cssColor("--bg", "#0a0b0d");
  const siteAccent = cssColor("--accent", "#f26b38");
  const clayColor = cssColor("--clay", "#b8b1a6");

  const scene = new THREE.Scene();
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, 0.042);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
  scene.add(camera); // lights below ride along with the camera

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ---------------------------------------------------------------------
  // Lights: dim fill, a key that travels with the camera, and the cursor light
  // ---------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xe6ebff, 0x1b1813, 0.4);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xfff0e0, 1.3);
  key.position.set(-4, 5, 2);
  const keyTarget = new THREE.Object3D();
  keyTarget.position.set(0, 0, -10);
  camera.add(key, keyTarget);
  key.target = keyTarget;

  const cursorLight = new THREE.PointLight(0xfff2e8, 34, 22, 2);
  cursorLight.position.set(0, 0, -3);
  camera.add(cursorLight);

  // ---------------------------------------------------------------------
  // Camera path through the void (data-driven: one bend per project)
  // ---------------------------------------------------------------------
  const pathPoints = [];
  for (let k = 0; k < n + 2; k++) {
    const sway = k === 0 ? 0 : 1;
    pathPoints.push(new THREE.Vector3(
      Math.sin(k * 1.15) * 3.4 * sway,
      Math.sin(k * 0.73 + 0.6) * 1.1 * sway,
      -k * SPACING
    ));
  }
  const curve = new THREE.CatmullRomCurve3(pathPoints, false, "centripetal", 0.5);
  const pathLength = curve.getLength();

  // Scroll progress at which each project is "framed".
  const stops = projects.map((_, i) => (i + 1) / (n + 1));

  // ---------------------------------------------------------------------
  // Project objects
  // ---------------------------------------------------------------------
  const objects = projects.map((project, i) => {
    const shape = getShape(project.shape);
    const finish = FINISHES[project.finish] || FINISHES.satin;
    const finalColor = new THREE.Color(project.accent || "#d4d2dc");

    const { material, uniforms } = createRenderMaterial({
      color: clayColor,
      edgeColor: siteAccent,
      envMap: envTexture,
      sweepHalf: shape.sweepHalf,
      flatShading: shape.flat,
    });
    const wireMat = createWireMaterial(siteAccent, { fog: true });

    const group = new THREE.Group();   // placement + bob
    const spinner = new THREE.Group(); // idle rotation + hover scale
    const mesh = new THREE.Mesh(shape.surface, material);
    const lines = new THREE.LineSegments(shape.wire, wireMat);
    spinner.add(mesh, lines);
    group.add(spinner);

    // Place it just past its stop, off to one side of the path.
    const s = Math.min(stops[i] + AHEAD / pathLength, 1);
    const base = curve.getPointAt(s);
    const tan = curve.getTangentAt(s);
    const side = i % 2 === 0 ? 1 : -1;
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize().multiplyScalar(side * LATERAL);
    group.position.copy(base).add(perp);
    group.position.y += ((i * 37) % 5 - 2) * 0.22;
    const upright = Boolean(project.worldModel);
    spinner.rotation.set(upright ? 0.12 : i * 0.7, i * 1.3, upright ? 0 : i * 0.4);
    scene.add(group);

    const obj = {
      index: i,
      project,
      group,
      spinner,
      mesh,
      lines,
      material,
      wireMat,
      uniforms,
      finish,
      finalColor,
      radius: shape.radius,
      home: group.position.clone(),
      spin: 0.12 + ((i * 53) % 7) * 0.02,
      upright,
      model: null,           // set once its worldModel has loaded (see installModel)
      state: { reveal: 0, wire: 1, finish: 0, hover: 0 },
      rendered: false,
      tl: null,
      hoverTween: null,
    };
    applyObject(obj);
    return obj;
  });

  const hoverGlow = new THREE.Color();

  function applyObject(o) {
    const st = o.state;
    const f = o.finish;

    // Distant wireframes sit back a little; hover brings them to full strength.
    o.wireMat.opacity = st.wire * (0.6 + 0.4 * st.hover);
    o.lines.visible = o.wireMat.opacity > 0.002;
    o.spinner.scale.setScalar(1 + 0.08 * st.hover);

    if (o.model) {
      // Clay -> the model's own Blender materials; hover adds the project's glow.
      o.model.group.visible = st.reveal > 0.001;
      const env = lerp(CLAY.env, 0.6, st.finish);
      for (const part of o.model.parts) {
        part.set({ reveal: st.reveal, finish: st.finish, rough: CLAY.rough, metal: CLAY.metal, env });
        hoverGlow.copy(o.finalColor).multiplyScalar((0.22 * st.hover) / (part.material.emissiveIntensity || 1));
        part.material.emissive.add(hoverGlow);
      }
      return;
    }

    o.uniforms.uReveal.value = st.reveal;
    o.mesh.visible = st.reveal > 0.001;
    const m = o.material;
    m.color.lerpColors(clayColor, o.finalColor, st.finish);
    m.roughness = lerp(CLAY.rough, f.rough, st.finish);
    m.metalness = lerp(CLAY.metal, f.metal, st.finish);
    m.clearcoat = Math.max(lerp(CLAY.coat, f.coat, st.finish), 0.0001);
    m.iridescence = Math.max(lerp(CLAY.irid, f.irid, st.finish), 0.0001);
    m.envMapIntensity = lerp(CLAY.env, f.env, st.finish);
    m.emissive.copy(o.finalColor).multiplyScalar(0.22 * st.hover);
  }

  /** Swap a project's stand-in primitive for its loaded model. */
  function installModel(o, model) {
    o.spinner.remove(o.mesh, o.lines);
    o.material.dispose();
    o.model = model;
    o.radius = model.radius;
    o.lines = new THREE.LineSegments(model.wire, o.wireMat);
    o.spinner.add(model.group, o.lines);
    applyObject(o);
  }

  // Project models stream in behind the loader; work.js waits (briefly) for them.
  const modelsReady = Promise.all(objects.map((o) => {
    if (!o.project.worldModel) return null;
    return loadWorldModel(o.project.worldModel, { clay: clayColor, edgeColor: siteAccent, envMap: envTexture })
      .then((model) => installModel(o, model))
      .catch((err) => console.warn(`[world] ${o.project.worldModel} could not be loaded; keeping the ${o.project.shape || "sphere"} primitive.`, err));
  })).then(() => renderer.compileAsync(scene, camera));

  /** Wireframe -> clay dissolve -> final material. */
  function renderObject(o, { instant = false } = {}) {
    if (o.rendered && !instant) return;
    o.rendered = true;
    o.tl?.kill();
    if (instant || reducedMotion) {
      Object.assign(o.state, { reveal: 1.02, wire: 0, finish: 1 });
      applyObject(o);
      return;
    }
    const update = () => applyObject(o);
    o.tl = gsap.timeline()
      .to(o.state, { reveal: 1.02, duration: 1.5, ease: "power1.inOut", onUpdate: update }, 0)
      .to(o.state, { wire: 0, duration: 1.1, ease: "power1.in", onUpdate: update }, 0.45)
      .to(o.state, { finish: 1, duration: 1.3, ease: "power2.inOut", onUpdate: update }, 1.1);
  }

  /** Back to a wireframe, quicker than the render. */
  function unrenderObject(o) {
    if (!o.rendered) return;
    o.rendered = false;
    o.tl?.kill();
    if (reducedMotion) {
      Object.assign(o.state, { reveal: 0, wire: 1, finish: 0 });
      applyObject(o);
      return;
    }
    const update = () => applyObject(o);
    o.tl = gsap.timeline()
      .to(o.state, { finish: 0, duration: 0.5, ease: "power1.in", onUpdate: update }, 0)
      .to(o.state, { wire: 1, duration: 0.5, ease: "power1.out", onUpdate: update }, 0)
      .to(o.state, { reveal: 0, duration: 0.8, ease: "power1.inOut", onUpdate: update }, 0.2);
  }

  // ---------------------------------------------------------------------
  // Dust: one Points cloud strung along the path, drifting in the shader
  // ---------------------------------------------------------------------
  const DUST = 1100;
  const dustPos = new Float32Array(DUST * 3);
  const tmp = new THREE.Vector3();
  for (let i = 0; i < DUST; i++) {
    curve.getPointAt(Math.random(), tmp);
    const a = Math.random() * Math.PI * 2;
    const r = 2 + Math.random() * 12;
    dustPos[i * 3] = tmp.x + Math.cos(a) * r;
    dustPos[i * 3 + 1] = tmp.y + Math.sin(a) * r * 0.7;
    dustPos[i * 3 + 2] = tmp.z + (Math.random() - 0.5) * 8;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustTime = { value: 0 };
  const dustMat = new THREE.PointsMaterial({
    color: 0x8b8d92,
    size: 0.035,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  dustMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = dustTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         transformed.x += sin(uTime * 0.13 + position.z * 0.4) * 0.35;
         transformed.y += cos(uTime * 0.11 + position.x * 0.5) * 0.3;`
      );
  };
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  // ---------------------------------------------------------------------
  // Pointer: parallax tilt, cursor light, hover
  // ---------------------------------------------------------------------
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const pointer = { x: 0, y: 0, active: false };
  const tilt = { x: 0, y: 0 };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = -1;
  let focused = -1; // keyboard focus from the project links (work.js)

  function setPointer(nx, ny) {
    pointer.x = nx;
    pointer.y = ny;
    pointer.active = true;
  }

  const centre = new THREE.Vector3();
  const toObj = new THREE.Vector3();
  const forward = new THREE.Vector3();

  /** Index of the object under normalised coords (nx, ny), or -1. */
  function pick(nx, ny) {
    ndc.set(nx, ny);
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(forward);
    let best = -1;
    let bestDist = Infinity;
    for (const o of objects) {
      o.group.getWorldPosition(centre);
      const d = centre.distanceTo(camera.position);
      if (d > HOVER_RANGE) continue;
      if (toObj.subVectors(centre, camera.position).dot(forward) <= 0) continue; // behind us
      const r = o.radius * 1.05;
      if (raycaster.ray.distanceSqToPoint(centre) < r * r && d < bestDist) {
        best = o.index;
        bestDist = d;
      }
    }
    return best;
  }

  function setHovered(index) {
    if (index === hovered) return;
    const prev = objects[hovered];
    const next = objects[index];
    hovered = index;
    if (prev) {
      prev.hoverTween?.kill();
      prev.hoverTween = gsap.to(prev.state, { hover: 0, duration: 0.5, ease: "power2.out", onUpdate: () => applyObject(prev) });
    }
    if (next) {
      next.hoverTween?.kill();
      next.hoverTween = gsap.to(next.state, { hover: 1, duration: 0.45, ease: "power2.out", onUpdate: () => applyObject(next) });
    }
    onHoverChange(index);
  }

  // ---------------------------------------------------------------------
  // Label: follows the labelled object on screen, sits on its inner side
  // ---------------------------------------------------------------------
  let labelIndex = -1;
  const projected = new THREE.Vector3();

  function setLabel(index) {
    if (index === labelIndex || !labelEl) return;
    labelIndex = index;
    if (index < 0) {
      labelEl.classList.remove("is-visible");
      return;
    }
    const p = projects[index];
    labelEl.querySelector("[data-label-title]").textContent = p.title;
    labelEl.querySelector("[data-label-meta]").textContent = `${p.type || p.discipline || "Project"} / ${p.year}`;
    labelEl.classList.add("is-visible");
    positionLabel();
  }

  function positionLabel() {
    if (labelIndex < 0 || !labelEl) return;
    const o = objects[labelIndex];
    o.group.getWorldPosition(projected);
    const dist = projected.distanceTo(camera.position);
    projected.project(camera);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const rPx = (o.radius * (1 + 0.08 * o.state.hover) / (dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (h / 2);
    // Narrow screens: under the object. Otherwise on the side facing the screen centre.
    const below = w < 640;
    const leftSide = !below && x > w / 2;
    const lx = below ? x : leftSide ? x - rPx - 18 : x + rPx + 18;
    const ly = below ? y + rPx + 18 : y - 10;
    labelEl.classList.toggle("is-left", leftSide);
    labelEl.classList.toggle("is-below", below);
    labelEl.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0)`;
  }

  // ---------------------------------------------------------------------
  // Scroll progress + camera
  // ---------------------------------------------------------------------
  let targetP = 0;
  let p = 0;
  let activeIndex = -1;
  let flying = false;

  /** Progress 0..1 from the scroll position. `instant` skips the easing. */
  function setProgress(value, { instant = false } = {}) {
    targetP = clamp01(value);
    if (instant) p = targetP;
  }

  const camPos = new THREE.Vector3();
  const camTan = new THREE.Vector3();
  const lookAhead = new THREE.Vector3();
  const lookFocus = new THREE.Vector3();

  function updateCamera(dt) {
    // Ease toward the scroll position: smooth, frame-rate independent.
    p += (targetP - p) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 3.2));

    curve.getPointAt(p, camPos);
    curve.getTangentAt(p, camTan);
    camera.position.copy(camPos);
    lookAhead.copy(camPos).addScaledVector(camTan, 8);

    // Nearest stop: the counter, and a gentle turn of the head toward it.
    let nearest = 0;
    let gap = Infinity;
    stops.forEach((s, i) => {
      const d = Math.abs(p - s);
      if (d < gap) {
        gap = d;
        nearest = i;
      }
    });
    if (nearest !== activeIndex) {
      activeIndex = nearest;
      onActiveChange(nearest);
    }
    const halfStep = 0.5 / (n + 1);
    // Portrait screens have little width to spare, so turn further toward the object.
    const focusMax = camera.aspect < 1 ? 0.88 : 0.45;
    const focusW = focusMax * (1 - smoothstep(0, halfStep, gap));
    objects[nearest].group.getWorldPosition(lookFocus);
    lookAhead.lerp(lookFocus, focusW);
    camera.lookAt(lookAhead);

    // Parallax tilt from the pointer.
    if (!reducedMotion) {
      const k = 1 - Math.exp(-dt * 2.5);
      tilt.x += ((pointer.active ? pointer.x : 0) - tilt.x) * k;
      tilt.y += ((pointer.active ? pointer.y : 0) - tilt.y) * k;
      camera.rotateY(-tilt.x * 0.07);
      camera.rotateX(tilt.y * 0.045);
    }
  }

  // ---------------------------------------------------------------------
  // Fly into a project, then hand over to its page
  // ---------------------------------------------------------------------
  function open(index, { onArrive }) {
    const o = objects[index];
    if (!o || flying) return;
    flying = true;
    setHovered(-1);
    setLabel(-1);
    renderObject(o);
    onFlyStart(index);

    if (reducedMotion) {
      onArrive();
      return;
    }

    const target = o.group.getWorldPosition(new THREE.Vector3());
    const startPos = camera.position.clone();
    const startQ = camera.quaternion.clone();
    const dir = startPos.clone().sub(target).normalize();
    // Stop just outside the surface: close enough that it fills the frame.
    const endPos = target.clone().addScaledVector(dir, o.radius * 1.28);
    const endQ = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().lookAt(startPos, target, camera.up)
    );

    const f = { t: 0 };
    gsap.timeline()
      .to(f, {
        t: 1,
        duration: 1.6,
        ease: "power3.inOut",
        onUpdate: () => {
          camera.position.lerpVectors(startPos, endPos, f.t);
          camera.quaternion.slerpQuaternions(startQ, endQ, Math.min(1, f.t * 1.8));
        },
      })
      .call(onArrive, null, 1.25);
  }

  /** After coming back via the browser's back button (bfcache restore). */
  function resetFlight() {
    flying = false;
  }

  // ---------------------------------------------------------------------
  // Frame loop (only while the section is on screen and the tab is visible)
  // ---------------------------------------------------------------------
  const clock = new THREE.Clock();
  let time = 0;

  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    dustTime.value = time;

    if (!flying) updateCamera(dt);

    // Cursor light sits a little in front of the lens, where the pointer is.
    const lx = pointer.active ? pointer.x * 3.2 : -1.2;
    const ly = pointer.active ? pointer.y * 2 : 1;
    const follow = 1 - Math.exp(-dt * (pointer.active ? 30 : 6)); // keeps up with the system cursor
    cursorLight.position.x += (lx - cursorLight.position.x) * follow;
    cursorLight.position.y += (ly - cursorLight.position.y) * follow;

    for (const o of objects) {
      if (!reducedMotion) {
        o.spinner.rotation.y += dt * o.spin;
        if (o.upright) o.spinner.rotation.x = 0.12 + Math.sin(time * 0.5 + o.index) * 0.06;
        else o.spinner.rotation.x += dt * o.spin * 0.35;
        o.group.position.y = o.home.y + Math.sin(time * 0.6 + o.index * 1.7) * 0.12;
      }
      // Proximity render, with a gap between the two distances so it never flickers.
      const d = o.group.position.distanceTo(camera.position);
      if (!o.rendered && d < RENDER_NEAR) renderObject(o);
      else if (o.rendered && d > RENDER_FAR && !flying) unrenderObject(o);
    }

    // Hover (re-checked every frame because objects move under a still pointer).
    // Keyboard focus wins over the pointer.
    if (!flying) {
      if (focused >= 0) setHovered(focused);
      else if (finePointer && pointer.active) setHovered(pick(pointer.x, pointer.y));
    }

    // Label: focused or hovered object on desktop; on touch, the framed object when close.
    if (!flying) {
      if (focused >= 0) setLabel(focused);
      else if (finePointer) setLabel(hovered);
      else {
        const o = objects[activeIndex];
        const near = o && Math.abs(p - stops[activeIndex]) < 0.35 / (n + 1);
        setLabel(near ? activeIndex : -1);
      }
      positionLabel();
    }

    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------------
  // Sizing and run state
  // ---------------------------------------------------------------------
  function layout() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow screens: widen the lens a touch so side objects stay in frame.
    camera.fov = camera.aspect < 0.8 ? 62 : 48;
    camera.updateProjectionMatrix();
  }

  let running = false;
  let pageVisible = !document.hidden;
  let onScreen = false;

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

  const onVisibility = () => {
    pageVisible = !document.hidden;
    updateRunning();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const io = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    updateRunning();
  });
  io.observe(canvas);

  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  });
  ro.observe(canvas);
  layout();
  updateCamera(1);

  return {
    stops,
    /** Resolves once every project model has loaded (or fallen back) and compiled. */
    modelsReady,
    setProgress,
    setPointer,
    pick,
    open,
    resetFlight,
    renderNow: (i) => objects[i] && renderObject(objects[i], { instant: true }),
    /** Keyboard focus on a project (-1 to clear): lights it up and labels it. */
    setFocus(i) {
      focused = i;
      if (i < 0) setHovered(-1);
    },
    get hovered() {
      return hovered;
    },

    /** Compile every shader variant up front so the first render does not hitch. */
    warmUp() {
      objects.forEach((o) => {
        if (o.model) o.model.group.visible = true;
        else o.mesh.visible = true;
      });
      renderer.compile(scene, camera);
      objects.forEach((o) => applyObject(o));
    },

    /** Free GPU memory: geometries, materials, textures, renderer. */
    dispose() {
      renderer.setAnimationLoop(null);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      objects.forEach((o) => {
        o.tl?.kill();
        o.hoverTween?.kill();
        if (o.model) o.model.dispose();
        else o.material.dispose();
        o.wireMat.dispose();
        scene.remove(o.group);
      });
      disposeShapes();
      dustGeo.dispose();
      dustMat.dispose();
      envTexture.dispose();
      renderer.dispose();
    },
  };
}
