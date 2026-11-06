/**
 * Hero: fills in content from data/projects.json, builds the 3D scene,
 * keeps the title's "render pass" in sync with the object, and wires up
 * the shading switcher, the cursor light and the title's weight swell.
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

  // ---- 3D scene (optional: the page still works without WebGL) ---------
  let scene = null;
  try {
    scene = createScene(q("[data-hero-canvas]"), { reducedMotion, models: artist.heroModels || [] });
    scene.warmUp();
    // A real model's light wireframe copy loads during the page loader;
    // the textured model keeps streaming in behind the intro.
    await scene.wireReady;
  } catch (err) {
    console.warn("[hero] WebGL unavailable, showing static hero.", err);
    hero.classList.add("no-webgl");
  }

  // ---- Stage sync -------------------------------------------------------
  function setStage(mode) {
    hero.dataset.stage = mode;
    modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }

  let intro = null;

  function goTo(mode) {
    intro?.kill();
    intro = null;
    revealUi(true);
    hero.classList.add("is-ready");
    setStage(mode);
    scene?.setMode(mode, { duration: reducedMotion ? 0 : 1.2 });
  }

  modeButtons.forEach((b) => b.addEventListener("click", () => goTo(b.dataset.mode)));

  // Number keys 1 to 4 switch passes, like shading hotkeys in a 3D app.
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
    setStage("final");
  }

  scene?.start();

  return {
    /** Resolves once the hero's textured model is in (or failed), i.e. it is done with the network. */
    ready: scene ? scene.fullReady : Promise.resolve(),

    /** skipIntro: land on the finished hero (e.g. when returning to a project further down). */
    play({ skipIntro = false } = {}) {
      if (reducedMotion || skipIntro) {
        setStage("final");
        scene?.setMode("final", { duration: 0 });
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
        intro = scene.playIntro({ onStage, onComplete });
      } else {
        // No WebGL: still walk the title through its passes.
        intro = gsap.timeline({ onComplete })
          .call(() => onStage("clay"), null, 1.6)
          .call(() => onStage("lit"), null, 3.2)
          .call(() => onStage("final"), null, 4.6);
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
