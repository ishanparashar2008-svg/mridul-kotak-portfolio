/**
 * Sound design, all synthesised with the Web Audio API (no audio files).
 *
 *  - Ambient hum: two low detuned sines and a little filtered noise, with
 *    a slow sweep on the filter so it breathes.
 *  - Hover: a soft, short high blip. Click: a small low "tock".
 *  - Whoosh: filtered noise sweep for the fly-in page transition.
 *
 * OFF by default. The corner toggle turns it on; the choice is remembered in
 * localStorage. Browsers only allow audio after a user gesture, so if it was
 * left on, it starts on the first click or key press of the next visit.
 */

const STORE_KEY = "render:sound";
const INTERACTIVE = 'a, button, [role="button"], [role="tab"], [role="slider"]';

let ctx = null;
let master = null;
let enabled = false;
let lastHover = 0;
let toggles = [];

function readPref() {
  try {
    return localStorage.getItem(STORE_KEY) === "on";
  } catch {
    return false;
  }
}

function writePref(on) {
  try {
    localStorage.setItem(STORE_KEY, on ? "on" : "off");
  } catch {
    /* private mode: just don't remember */
  }
}

function noiseBuffer(seconds, brown = false) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else data[i] = white;
  }
  return buf;
}

/** Build the audio graph once, on the first gesture that needs it. */
function ensureContext() {
  if (ctx) return true;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  // Ambient hum
  const humFilter = ctx.createBiquadFilter();
  humFilter.type = "lowpass";
  humFilter.frequency.value = 320;
  humFilter.Q.value = 0.7;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.05;
  humFilter.connect(humGain).connect(master);

  [[55, 0.6], [55.4, 0.5], [82.6, 0.18], [110.2, 0.12]].forEach(([freq, level]) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(humFilter);
    osc.start();
  });

  // Slow breathing on the filter
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 120;
  lfo.connect(lfoDepth).connect(humFilter.frequency);
  lfo.start();

  // A breath of air on top
  const air = ctx.createBufferSource();
  air.buffer = noiseBuffer(4, true);
  air.loop = true;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 500;
  airFilter.Q.value = 0.6;
  const airGain = ctx.createGain();
  airGain.gain.value = 0.02;
  air.connect(airFilter).connect(airGain).connect(master);
  air.start();

  // Pause everything while the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (!enabled) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  });
  return true;
}

function fadeMaster(to, seconds) {
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setValueAtTime(master.gain.value, now);
  master.gain.linearRampToValueAtTime(to, now + seconds);
}

function start() {
  if (!ensureContext()) return;
  ctx.resume();
  fadeMaster(1, 1.4);
}

function stop() {
  if (!ctx) return;
  fadeMaster(0, 0.5);
  setTimeout(() => !enabled && ctx.suspend(), 600);
}

function setEnabled(on, { remember = true, play = true } = {}) {
  enabled = on;
  if (remember) writePref(on);
  toggles.forEach((t) => {
    t.setAttribute("aria-pressed", String(on));
    const label = t.querySelector("[data-sound-label]");
    if (label) label.textContent = on ? "Sound on" : "Sound off";
  });
  if (!play) return;
  if (on) start();
  else stop();
}

/** A short enveloped tone. */
function tone({ freq, to = freq, type = "sine", gain = 0.03, attack = 0.005, decay = 0.14 }) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, now + decay);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(gain, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  osc.connect(g).connect(master);
  osc.start(now);
  osc.stop(now + attack + decay + 0.05);
}

export const sfx = {
  hover() {
    const t = performance.now();
    if (t - lastHover < 70) return; // never a machine-gun of blips
    lastHover = t;
    tone({ freq: 1320, gain: 0.018, decay: 0.12 });
    tone({ freq: 2640, gain: 0.005, decay: 0.08 });
  },
  click() {
    tone({ freq: 520, to: 240, gain: 0.05, decay: 0.09 });
  },
  whoosh() {
    if (!enabled || !ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(1.6);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(180, now);
    bp.frequency.exponentialRampToValueAtTime(2600, now + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.07, now + 0.9);
    g.gain.linearRampToValueAtTime(0, now + 1.55);
    src.connect(bp).connect(g).connect(master);
    src.start(now);
  },
};

/**
 * Wire up every [data-sound-toggle] on the page plus the global hover and
 * click tones. Call once per page.
 */
export function initSound() {
  toggles = [...document.querySelectorAll("[data-sound-toggle]")];
  toggles.forEach((t) =>
    t.addEventListener("click", () => {
      setEnabled(!enabled);
      if (enabled) tone({ freq: 880, to: 1320, gain: 0.03, decay: 0.18 });
    })
  );

  // Remembered "on": show it as on, start on the first gesture.
  if (readPref()) {
    setEnabled(true, { remember: false, play: false }); // no AudioContext before a gesture
    const wake = () => {
      if (enabled) start();
      window.removeEventListener("pointerdown", wake, true);
      window.removeEventListener("keydown", wake, true);
    };
    window.addEventListener("pointerdown", wake, true);
    window.addEventListener("keydown", wake, true);
  }

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "touch" && e.target.closest?.(INTERACTIVE)) {
      const from = e.relatedTarget?.closest?.(INTERACTIVE);
      if (from !== e.target.closest(INTERACTIVE)) sfx.hover();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest?.(INTERACTIVE) && !e.target.closest("[data-sound-toggle]")) sfx.click();
  });
}
