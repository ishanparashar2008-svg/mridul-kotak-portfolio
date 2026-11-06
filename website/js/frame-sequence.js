/**
 * Canvas player for a Blender-rendered image sequence.
 *
 * Adapted from the blender-scroll-3d skill's scroll-sequence.js. The page
 * owns the scroll (GSAP ScrollTrigger in making.js) and hands progress in
 * through setProgress(); this module only loads frames, eases toward the
 * target and draws.
 *
 * - Reads manifest.json written by 3d/compose_cathedral.py.
 * - Loads the first and last frames, then coarse-to-fine, so scrubbing works
 *   within a second and sharpens as the rest arrive.
 * - A separate portrait set is used when mobileQuery matches.
 * - Elements with data-from / data-to (0..1) fade in and out with progress.
 *   The player writes their opacity, transform and visibility, so position
 *   them with left/right/top/bottom, never with transform.
 * - The canvas backing store is capped at the frames' own resolution and the
 *   loop only runs while the section is on screen and the tab is visible.
 */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

export function createFrameSequence(section, {
  canvas,
  sets,                          // { desktop: url, mobile: url } (manifest.json)
  mobileQuery = "(max-aspect-ratio: 4/5)",
  fit = "cover",                 // "cover" | "contain"
  smoothing = 0.16,              // per 60 Hz frame; 1 = instant
  concurrency = 6,
  onProgress = () => {},
  onReady = () => {},
}) {
  const ctx = canvas.getContext("2d", { alpha: false });
  const overlays = [...section.querySelectorAll("[data-from]")].map((el) => ({
    el,
    from: parseFloat(el.dataset.from),
    to: parseFloat(el.dataset.to),
    fade: parseFloat(el.dataset.fade || 0.06),
    o: -1,
  }));

  let seq = null;        // { manifest, base, images[], loaded[] }
  let target = 0;
  let current = 0;
  let lastDrawn = -1;
  let lastProgress = -1;
  let loadToken = 0;

  // ---- Loading ------------------------------------------------------------------

  const urlFor = (s, i) => `${s.base}${s.manifest.prefix}${String(i + 1).padStart(s.manifest.pad, "0")}${s.manifest.ext}`;

  function loadOrder(n) {
    const order = n > 1 ? [0, n - 1] : [0];
    const seen = new Set(order);
    for (let stride = 2 ** Math.floor(Math.log2(Math.max(1, n))); stride >= 1; stride = Math.floor(stride / 2)) {
      for (let i = 0; i < n; i += stride) {
        if (!seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      }
    }
    return order;
  }

  async function loadSet(manifestUrl) {
    const token = ++loadToken;
    const res = await fetch(manifestUrl);
    if (!res.ok) throw new Error(`Could not load ${manifestUrl}`);
    const manifest = await res.json();
    const base = new URL(".", new URL(manifestUrl, window.location.href)).href;
    const s = { manifest, base, images: new Array(manifest.count), loaded: new Uint8Array(manifest.count) };
    seq = s;
    resize();
    onReady(manifest);

    const queue = loadOrder(manifest.count);
    let first = true;
    async function worker() {
      while (queue.length && token === loadToken) {
        const i = queue.shift();
        const img = new Image();
        img.decoding = "async";
        img.src = urlFor(s, i);
        try {
          await img.decode();
        } catch {
          continue;
        }
        if (token !== loadToken) return;
        s.images[i] = img;
        s.loaded[i] = 1;
        lastDrawn = -1; // a better frame may have arrived
        if (first) {
          first = false;
          section.classList.add("is-ready");
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    if (token === loadToken) section.classList.add("is-loaded");
  }

  function nearestLoaded(i) {
    const { loaded } = seq;
    if (loaded[i]) return i;
    for (let d = 1; d < loaded.length; d++) {
      if (i - d >= 0 && loaded[i - d]) return i - d;
      if (i + d < loaded.length && loaded[i + d]) return i + d;
    }
    return -1;
  }

  // ---- Drawing ------------------------------------------------------------------

  function resize() {
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    let scale = Math.min(window.devicePixelRatio || 1, 2);
    if (seq && cssW && cssH) {
      // never allocate more canvas pixels than the frames have
      const { width: iw, height: ih } = seq.manifest;
      const fitCss = fit === "contain" ? Math.min(cssW / iw, cssH / ih) : Math.max(cssW / iw, cssH / ih);
      scale = Math.min(scale, 1 / fitCss);
    }
    const w = Math.round(cssW * scale);
    const h = Math.round(cssH * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    lastDrawn = -1;
  }

  function draw(index) {
    const i = nearestLoaded(index);
    if (i < 0) return;
    const img = seq.images[i];
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = fit === "contain"
      ? Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
      : Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    lastDrawn = i === index ? index : -1; // keep looking for the exact frame
  }

  function updateOverlays(p) {
    for (const s of overlays) {
      const { from, to, fade } = s;
      let o = 0;
      if (p >= from && p <= to) o = Math.min(1, (p - from) / fade, (to - p) / fade);
      if (from <= 0 && p <= to) o = Math.min(1, (to - p) / fade);
      if (to >= 1 && p >= from) o = Math.min(1, (p - from) / fade);
      o = Math.round(o * 1000) / 1000;
      if (o === s.o) continue;
      s.o = o;
      s.el.style.opacity = o;
      s.el.style.transform = `translate3d(0, ${((1 - o) * 12).toFixed(1)}px, 0)`;
      s.el.style.visibility = o > 0 ? "visible" : "hidden";
    }
  }

  // ---- Loop (only while on screen and the tab is visible) ------------------------

  let raf = 0;
  let lastT = 0;

  function tick(t) {
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min(64, t - lastT) : 16.667;
    lastT = t;
    if (!seq) return;
    // time-based easing: same feel at 60, 120 and 144 Hz
    const k = smoothing >= 1 ? 1 : 1 - Math.pow(1 - smoothing, dt / 16.667);
    current += (target - current) * k;
    const n = seq.manifest.count;
    if (Math.abs(target - current) < 0.25 / n) current = target;
    const index = Math.round(current * (n - 1));
    if (index !== lastDrawn) draw(index);
    if (current === lastProgress) return; // idle
    lastProgress = current;
    updateOverlays(current);
    onProgress(current, index);
  }

  let onScreen = false;
  let pageVisible = !document.hidden;
  function updateRunning() {
    const should = onScreen && pageVisible;
    if (should && !raf) {
      lastT = 0;
      raf = requestAnimationFrame(tick);
    } else if (!should && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }
  const onVisibility = () => {
    pageVisible = !document.hidden;
    updateRunning();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const io = new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    updateRunning();
  }, { rootMargin: "100px 0px" });
  io.observe(section);
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // ---- Sets -----------------------------------------------------------------------

  const mq = window.matchMedia(mobileQuery);
  const pickSet = () => (mq.matches && sets.mobile ? sets.mobile : sets.desktop);
  let activeUrl = pickSet();
  const load = (url) =>
    loadSet(url).catch((err) => {
      if (url !== sets.desktop) {
        console.warn(`[frames] ${err.message}, falling back to the desktop set`);
        activeUrl = sets.desktop;
        return load(sets.desktop);
      }
      console.warn("[frames]", err.message);
    });
  const onSetChange = () => {
    const next = pickSet();
    if (next !== activeUrl) {
      activeUrl = next;
      load(next);
    }
  };
  mq.addEventListener("change", onSetChange);
  load(activeUrl);

  return {
    /** Progress 0..1 from the page's scroll. `instant` skips the easing. */
    setProgress(p, { instant = false } = {}) {
      target = clamp01(p);
      if (instant) current = target;
    },
    get progress() {
      return current;
    },
    destroy() {
      loadToken++;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener("change", onSetChange);
      document.removeEventListener("visibilitychange", onVisibility);
    },
  };
}
