/**
 * "Watch a frame get made": the Saltwater Cathedral sequence between the
 * hero and the work.
 *
 * One camera move, rendered in Blender four times (wireframe, clay,
 * lighting, final) and stitched into bucket tiles by 3d/compose_cathedral.py.
 * Scroll scrubs it, so the shot renders on the way down and un-renders on
 * the way back up. The readouts (pass, samples, frame, tiles) run off the
 * same schedule the frames were composed with (it ships in manifest.json).
 *
 * Loading is deliberately late: nothing is fetched until the loader has
 * finished, the hero's model is in (or the visitor starts scrolling), and the
 * section is within ~1.5 screens. Reduced motion skips all of it and the CSS
 * shows the finished frame as a still.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const TOTAL_SAMPLES = 256;
const STAGES = ["wireframe", "clay", "lit", "final"]; // same names as the hero's data-stage
const pad = (n, len) => String(n).padStart(len, "0");

/**
 * @param {object} opts
 * @param {boolean} opts.reducedMotion
 * @param {Promise} [opts.after]  resolves when the hero no longer needs the network
 */
export function initMaking({ reducedMotion = false, after = Promise.resolve() } = {}) {
  const section = document.querySelector("[data-making]");
  if (!section) return;
  const q = (sel) => section.querySelector(sel);
  const ui = {
    samples: q("[data-making-samples]"),
    bar: q("[data-making-bar]"),
    frame: q("[data-making-frame]"),
    tiles: q("[data-making-tiles]"),
    pass: q("[data-making-pass]"),
  };

  // The markup shows the finished render (for no-JS and reduced motion).
  if (reducedMotion) return;
  section.dataset.stage = STAGES[0];
  ui.samples.textContent = "1";
  ui.bar.style.transform = "scaleX(0)";
  ui.frame.textContent = "001/120";
  ui.tiles.textContent = "0/144";
  ui.pass.textContent = "01/04";

  // Start once the hero has its model, or as soon as the visitor scrolls away from it.
  const scrolled = new Promise((resolve) => {
    const onScroll = () => {
      if (window.scrollY < window.innerHeight * 0.15) return;
      window.removeEventListener("scroll", onScroll);
      resolve();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  });
  const near = new Promise((resolve) => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      resolve();
    }, { rootMargin: "0px 0px 50% 0px" }); // section top within 1.5 screens
    io.observe(section);
  });

  Promise.all([near, Promise.race([after, scrolled])]).then(() => start(section, ui));
}

async function start(section, ui) {
  const { createFrameSequence } = await import("./frame-sequence.js");
  let schedule = null;

  function readouts(p, index) {
    if (!schedule) return;
    const { transitions, tiles, count } = schedule;
    const end = transitions[transitions.length - 1][1];
    const done = Math.min(1, p / end);
    ui.samples.textContent = Math.max(1, Math.round(done * TOTAL_SAMPLES));
    ui.bar.style.transform = `scaleX(${done.toFixed(4)})`;
    ui.frame.textContent = `${pad(index + 1, 3)}/${count}`;

    // Pass: switches halfway through each tile hand-off, like the captions.
    let stage = 0;
    let tileText = `0/${tiles}`;
    transitions.forEach(([a, b], i) => {
      if (p >= (a + b) / 2) stage = i + 1;
      if (p >= b) tileText = `${tiles}/${tiles}`;
      else if (p >= a) tileText = `${Math.floor(((p - a) / (b - a)) * tiles)}/${tiles}`;
    });
    ui.tiles.textContent = tileText;
    ui.pass.textContent = `${pad(stage + 1, 2)}/${pad(STAGES.length, 2)}`;
    if (section.dataset.stage !== STAGES[stage]) section.dataset.stage = STAGES[stage];
  }

  const seq = createFrameSequence(section, {
    canvas: section.querySelector("[data-making-canvas]"),
    sets: { desktop: section.dataset.desktop, mobile: section.dataset.mobile },
    onReady: (m) => {
      schedule = { transitions: m.transitions, tiles: m.tiles.cols * m.tiles.rows, count: m.count };
    },
    onProgress: readouts,
  });

  const st = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => seq.setProgress(self.progress),
  });
  seq.setProgress(st.progress, { instant: true });
}
