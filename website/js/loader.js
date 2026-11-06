/**
 * Render-style loader.
 *
 * Progress is a blend of real work and a minimum duration:
 *  - Each real task passed to step() raises a ceiling (up to 94%).
 *  - Time raises the displayed value toward that ceiling, so it never
 *    finishes before minDuration even on a warm cache.
 *  - finish() lifts the ceiling to 100%, shows a brief "Denoising" beat,
 *    then fades out.
 *
 * The numbers (samples, tiles, time, memory) are theatre, but they move
 * with the real progress so the readout never lies about being "done".
 */

const TOTAL_SAMPLES = 256;
const FADE_MS = 1000;      // keep in sync with .loader transition in loader.css

export function createLoader({ reducedMotion = false, steps = 1, minDuration = 2600 } = {}) {
  const el = document.getElementById("loader");
  const q = (sel) => el.querySelector(sel);
  const ui = {
    tiles: q("[data-loader-tiles]"),
    status: q("[data-loader-status]"),
    scene: q("[data-loader-scene]"),
    samples: q("[data-loader-samples]"),
    bar: q("[data-loader-bar]"),
    time: q("[data-loader-time]"),
    tileCount: q("[data-loader-tilecount]"),
    mem: q("[data-loader-mem]"),
  };

  // ---- Bucket grid -------------------------------------------------------
  const portrait = window.innerHeight > window.innerWidth;
  const cols = portrait ? 4 : 8;
  const rows = portrait ? 7 : 4;
  ui.tiles.style.setProperty("--cols", cols);
  ui.tiles.style.setProperty("--rows", rows);

  const tiles = [];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < cols * rows; i++) {
    const t = document.createElement("div");
    t.className = "tile";
    frag.appendChild(t);
    tiles.push(t);
  }
  ui.tiles.appendChild(frag);

  // Render order: roughly spiral out from the centre like a real bucket
  // renderer, with a little shuffle so it does not look mechanical.
  const cx = (cols - 1) / 2;
  const cy = (rows - 1) / 2;
  const order = tiles
    .map((tile, i) => {
      const x = i % cols;
      const y = Math.floor(i / cols);
      const d = Math.hypot((x - cx) / cols, (y - cy) / rows);
      return { tile, key: d + Math.random() * 0.12 };
    })
    .sort((a, b) => a.key - b.key)
    .map((o) => o.tile);

  // ---- Progress state ----------------------------------------------------
  const start = performance.now();
  let stepsDone = 0;
  let ceiling = 0.18;  // how far we are allowed to show before real work lands
  let shown = 0;       // what the readout currently displays (0..1)
  let finishing = false;
  let finished = false;
  let resolveFinish = null;
  let rafId = 0;
  let last = start;
  let tilesDone = 0;

  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const formatTime = (ms) => {
    const s = ms / 1000;
    return `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}.${pad(Math.floor((s % 1) * 100))}`;
  };

  function draw(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const elapsed = now - start;

    // Time-based target with an ease-out curve, clamped by the ceiling.
    const t = Math.min(elapsed / minDuration, 1);
    const timeTarget = 1 - Math.pow(1 - t, 2.2);
    const target = Math.min(timeTarget, ceiling);
    shown += (target - shown) * (1 - Math.exp(-dt * 7));
    if (target - shown < 0.002) shown = target;

    // Readout
    const samples = Math.max(1, Math.round(shown * TOTAL_SAMPLES));
    ui.samples.textContent = samples;
    ui.bar.style.transform = `scaleX(${shown.toFixed(4)})`;
    ui.time.textContent = formatTime(elapsed);
    ui.mem.textContent = `${(118.4 + shown * 494.2).toFixed(1)}M`;

    // Tiles: done ones go transparent, the next two are "active" buckets
    const nextDone = Math.floor(shown * order.length);
    while (tilesDone < nextDone) {
      order[tilesDone].classList.remove("is-active");
      order[tilesDone].classList.add("is-done");
      tilesDone++;
    }
    for (let i = tilesDone; i < Math.min(tilesDone + 2, order.length); i++) {
      order[i].classList.add("is-active");
    }
    ui.tileCount.textContent = `${tilesDone}/${order.length}`;

    if (finishing && shown >= 1) {
      complete();
      return;
    }
    rafId = requestAnimationFrame(draw);
  }

  function complete() {
    if (finished) return;
    finished = true;
    ui.status.textContent = "Denoising";
    // A short beat on "Denoising" sells the moment, then fade into the hero.
    setTimeout(() => {
      ui.status.textContent = "Done";
      el.classList.add("is-done");
      el.setAttribute("aria-busy", "false");
      resolveFinish?.();
      setTimeout(() => el.remove(), FADE_MS + 50);
    }, reducedMotion ? 0 : 380);
  }

  el.setAttribute("aria-busy", "true");

  if (reducedMotion) {
    // No count-up theatre: show a static, finished-looking readout.
    ui.samples.textContent = TOTAL_SAMPLES;
    ui.bar.style.transform = "scaleX(1)";
    tiles.forEach((t) => t.classList.add("is-done"));
    ui.tileCount.textContent = `${tiles.length}/${tiles.length}`;
  } else {
    rafId = requestAnimationFrame(draw);
  }

  return {
    /** Track one real loading task. Returns the same promise. */
    step(promise) {
      return Promise.resolve(promise).then((value) => {
        stepsDone++;
        ceiling = Math.max(ceiling, 0.18 + 0.76 * Math.min(stepsDone / steps, 1));
        return value;
      });
    },

    /** Small label in the top-right of the readout, e.g. "5 objects". */
    setSceneLabel(text) {
      ui.scene.textContent = text;
    },

    /** Complete the count, fade out. Resolves when the fade begins. */
    finish({ immediate = false } = {}) {
      return new Promise((resolve) => {
        resolveFinish = resolve;
        ceiling = 1;
        finishing = true;
        if (reducedMotion || immediate) {
          cancelAnimationFrame(rafId);
          shown = 1;
          complete();
        }
      });
    },
  };
}
