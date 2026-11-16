/**
 * Hero: fills in content from data/projects.json, builds the 3D carousel,
 * keeps the title's "render pass" in sync with the models, and wires up the
 * shading switcher, the cursor light, the scroll-driven carousel, the
 * per-mode environment PNGs, the final-mode PNGs and the title's weight swell.
 *
 * Content lives in artist.hero:
 *   environments: { wireframe, clay, final }   one PNG each, rendered with no models
 *   models: [{ name, src, wire, final, rotation }] x3
 *     src/wire  GLB for the live wireframe and clay passes (missing = placeholder cube)
 *     final     PNG of the model's final render at the front slot (see js/hero-rig.js)
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { createScene, MODE_ORDER } from "./scene.js";
import { initShowreel } from "./showreel.js";

// Registered now so later phases (the project void) can use it straight away.
gsap.registerPlugin(ScrollTrigger);

export async function initHero({ data, reducedMotion = false }) {
  const hero = document.querySelector("[data-hero]");
  const q = (sel) => hero.querySelector(sel);
  const titleEl = q("[data-hero-name]");
  const roleEl = q("[data-hero-role]");
  const reelEl = q("[data-hero-reel]");
  const reelLengthEl = q("[data-hero-reel-length]");
  const actionsEl = q("[data-hero-actions]");
  const modesEl = q("[data-hero-modes]");
  const modeButtons = [...modesEl.querySelectorAll("[data-mode]")];
  const finalsEl = q("[data-hero-finals]");
  const stageEl = q(".hero__stage");
  const heroData = data.artist.hero || {};
  const modelConfigs = heroData.models || [];

  // ---- Content from data ----------------------------------------------
  const { artist } = data;
  titleEl.textContent = artist.name;
  roleEl.textContent = artist.role;
  // Watch Showreel opens the full-screen overlay (keeps the real URL for new-tab clicks).
  if (artist.showreel?.url && artist.showreel.url !== "#") reelEl.href = artist.showreel.url;
  initShowreel(reelEl, artist.showreel);
  if (artist.showreel?.length) reelLengthEl.textContent = artist.showreel.length;
  else reelLengthEl.remove();
  document.querySelector("[data-brand]").textContent = artist.name;
  document.title = `${artist.name} | ${artist.role}`;

  const letters = splitLetters(titleEl);

  // ---- Environment PNGs: one per mode -----------------------------------
  // Absolute URLs: a url() set from JS resolves against the stylesheet otherwise.
  const abs = (path) => new URL(path, window.location.href).href;
  for (const [mode, src] of Object.entries(heroData.environments || {})) {
    const el = hero.querySelector(`[data-hero-env="${mode}"]`);
    if (el && src) el.style.backgroundImage = `url("${abs(src)}")`;
  }

  // ---- Final-mode PNGs: one per model, moved every frame to follow the 3D --
  const finals = [0, 1, 2].map((i) => {
    const src = modelConfigs[i]?.final;
    if (!src) return null;
    const img = document.createElement("img");
    img.className = "hero__final";
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    finalsEl.append(img);
    return img;
  });
  // Final mode swaps to the PNGs only when every model has one; otherwise the
  // live 3D shows its own final material.
  const hasFinalRenders = finals.every(Boolean);
  hero.classList.toggle("has-final-renders", hasFinalRenders);

  function placeFinals(report) {
    const order = [...report].sort((a, b) => b.depth - a.depth); // far first
    for (const r of report) {
      const img = finals[r.index];
      if (!img) continue;
      img.style.transformOrigin = `${r.origin.x.toFixed(1)}px ${r.origin.y.toFixed(1)}px`;
      img.style.transform = `translate3d(${r.dx.toFixed(2)}px, ${r.dy.toFixed(2)}px, 0) scale(${r.scale.toFixed(4)})`;
      img.style.filter = r.focus > 0.995 ? "" : `brightness(${(0.45 + 0.55 * r.focus).toFixed(3)})`;
      img.style.zIndex = String(order.indexOf(r) + 1);
    }
  }

  // ---- 3D scene (optional: the page still works without WebGL) ---------
  let scene = null;
  try {
    scene = createScene(q("[data-hero-canvas]"), { reducedMotion, models: modelConfigs, onFrame: placeFinals });
    scene.warmUp();
    // GLB models load a light wireframe copy during the page loader;
    // the textured versions keep streaming in behind the intro.
    await scene.wireReady;
  } catch (err) {
    console.warn("[hero] WebGL unavailable, showing static hero.", err);
    hero.classList.add("no-webgl");
  }

  // ---- Scroll turns the carousel, settling on one model at a time -------
  ScrollTrigger.create({
    trigger: hero,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => scene?.setCarousel(self.progress),
    snap: reducedMotion
      ? undefined
      : { snapTo: [0, 0.5, 1], duration: { min: 0.25, max: 0.8 }, delay: 0.08, ease: "power2.inOut" },
  });

  // ---- Final sweep --------------------------------------------------------
  // The final pass "renders" over the live 3D: an accent scanline crosses the
  // screen left to right and the final layer (background + PNGs) resolves
  // behind it. Leaving final runs it back the other way.
  const SWEEP_S = 1.1; // a full crossing, in seconds
  const sweep = { p: 0 };
  let sweepTween = null;
  const paintSweep = () => stageEl.style.setProperty("--sweep", sweep.p.toFixed(4));

  function swept(to) {
    hero.classList.remove("is-sweeping", "is-sweeping-back");
    // Final PNGs fully cover the 3D: stop drawing WebGL until we leave final.
    if (to === 1 && hasFinalRenders) scene?.setDrawing(false);
  }

  function runSweep(to, instant = false) {
    sweepTween?.kill();
    if (to !== 1) scene?.setDrawing(true);
    const distance = Math.abs(to - sweep.p);
    if (instant || reducedMotion || distance < 0.001) {
      sweep.p = to;
      paintSweep();
      swept(to);
      return;
    }
    hero.classList.add("is-sweeping");
    hero.classList.toggle("is-sweeping-back", to < sweep.p);
    sweepTween = gsap.to(sweep, {
      p: to,
      duration: Math.max(0.35, SWEEP_S * distance),
      ease: "power2.inOut",
      onUpdate: paintSweep,
      onComplete: () => swept(to),
    });
  }

  // ---- Stage sync -------------------------------------------------------
  function setStage(mode, { instant = false } = {}) {
    hero.dataset.stage = mode;
    if (mode !== "final") hero.dataset.base = mode;
    modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    runSweep(mode === "final" ? 1 : 0, instant);
  }

  /** The 3D pass behind a stage: with final PNGs, final keeps the pass it swept over. */
  const scenePass = (mode) => (mode === "final" && hasFinalRenders ? hero.dataset.base : mode);

  let intro = null;

  function goTo(mode) {
    intro?.kill();
    intro = null;
    revealUi(true);
    hero.classList.add("is-ready");
    const pass = scenePass(mode);
    setStage(mode);
    scene?.setMode(pass, { duration: reducedMotion ? 0 : 0.9 });
  }

  modeButtons.forEach((b) => b.addEventListener("click", () => goTo(b.dataset.mode)));

  // Number keys 1 to 3 switch passes, like shading hotkeys in a 3D app.
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    const mode = MODE_ORDER[Number(e.key) - 1];
    if (mode && !document.documentElement.classList.contains("is-loading")) goTo(mode);
  });

  // ---- Cursor light -----------------------------------------------------
  if (scene) {
    window.addEventListener(
      "pointermove",
      (e) => scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1),
      { passive: true }
    );
  }

  initTitleSwell(hero, titleEl, letters);

  // ---- Entrance ---------------------------------------------------------
  // Everything except the title waits for its moment in the render.
  const lateUi = [roleEl, actionsEl, modesEl];

  function revealUi(instant = false) {
    gsap.to(lateUi, {
      autoAlpha: 1,
      y: 0,
      duration: instant ? 0.3 : 1.1,
      ease: "expo.out",
      stagger: instant ? 0 : 0.12,
      overwrite: true,
    });
  }

  if (!reducedMotion) {
    gsap.set(letters, { yPercent: 55, autoAlpha: 0 });
    gsap.set(lateUi, { autoAlpha: 0, y: 14 });
  } else {
    hero.dataset.base = "clay";
    setStage("final", { instant: true });
  }

  scene?.start();

  return {
    /** Resolves once the hero's textured model is in (or failed), i.e. it is done with the network. */
    ready: scene ? scene.fullReady : Promise.resolve(),

    /** skipIntro: land on the finished hero (e.g. when returning to a project further down). */
    play({ skipIntro = false } = {}) {
      if (reducedMotion || skipIntro) {
        hero.dataset.base = "clay";
        setStage("final", { instant: true });
        scene?.setMode(scenePass("final"), { duration: 0 });
        gsap.set(letters, { yPercent: 0, autoAlpha: 1 });
        gsap.set(lateUi, { autoAlpha: 1, y: 0 });
        hero.classList.add("is-ready");
        return;
      }

      // Letters rise in while the wireframe draws on.
      gsap.to(letters, {
        yPercent: 0,
        autoAlpha: 1,
        duration: 1.3,
        ease: "expo.out",
        stagger: 0.045,
        delay: 0.15,
      });

      const onStage = (mode) => {
        setStage(mode);
        if (mode === "clay") revealUi();
      };
      const onComplete = () => {
        intro = null;
        hero.classList.add("is-ready");
      };

      if (scene) {
        intro = scene.playIntro({ onStage, onComplete, finalLook: !hasFinalRenders });
      } else {
        // No WebGL: still walk the title through its passes.
        intro = gsap.timeline({ onComplete })
          .call(() => onStage("clay"), null, 1.1)
          .call(() => onStage("final"), null, 2.5);
      }
    },
  };
}

/**
 * Wrap each letter in a span (grouped by word so words never break apart).
 * Screen readers get the plain name via aria-label.
 */
function splitLetters(el) {
  const text = el.textContent.trim();
  el.setAttribute("aria-label", text);
  el.textContent = "";
  const letters = [];
  text.split(/\s+/).forEach((word) => {
    const w = document.createElement("span");
    w.className = "word";
    w.setAttribute("aria-hidden", "true");
    for (const ch of word) {
      const c = document.createElement("span");
      c.className = "ch";
      c.textContent = ch;
      w.appendChild(c);
      letters.push(c);
    }
    el.appendChild(w);
  });
  return letters;
}

/**
 * Variable-font weight swell: letters near the pointer grow toward 900.
 * Pure typography, nothing drawn over the text. Only on hover-capable
 * devices, and only once the intro has finished (.is-ready).
 */
function initTitleSwell(hero, titleEl, letters) {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

  let pointer = null;
  let raf = 0;
  let centres = [];

  // Measure letter centres once per hover (not every frame) to avoid layout
  // thrash while the weights are changing.
  const measure = () => {
    centres = letters.map((l) => {
      const r = l.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  };

  function update() {
    raf = 0;
    const radius = parseFloat(getComputedStyle(titleEl).fontSize) * 1.25;
    letters.forEach((l, i) => {
      if (!pointer || !hero.classList.contains("is-ready")) {
        l.style.removeProperty("--swell");
        return;
      }
      const c = centres[i];
      const d = Math.hypot(pointer.x - c.x, (pointer.y - c.y) * 1.4);
      const f = Math.max(0, 1 - d / radius);
      l.style.setProperty("--swell", (f * f * (3 - 2 * f)).toFixed(3));
    });
  }

  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };

  titleEl.addEventListener("pointerenter", measure);
  titleEl.addEventListener("pointermove", (e) => {
    if (!centres.length) measure();
    pointer = { x: e.clientX, y: e.clientY };
    schedule();
  });
  titleEl.addEventListener("pointerleave", () => {
    pointer = null;
    centres = [];
    schedule();
  });
}
