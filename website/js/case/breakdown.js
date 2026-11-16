/**
 * Render breakdown: the same shot in up to three passes.
 *
 * Passes mode: WIREFRAME / CLAY / FINAL tabs. Switching wipes
 *   the new pass in from the left behind a thin accent line (a render sweep).
 * Compare mode: a draggable before/after slider. The chosen tab is the
 *   "before" side; the last pass (usually FINAL) is always the "after" side.
 */

import { h } from "./dom.js";

export const PASS_ORDER = [
  { key: "wireframe", label: "Wireframe" },
  { key: "clay", label: "Clay" },
  { key: "final", label: "Final" },
];

const WIPE_MS = 750;

export function initBreakdown(section, breakdown, { title, reducedMotion = false }) {
  const passes = PASS_ORDER.filter((p) => breakdown?.[p.key]).map((p) => ({ ...p, src: breakdown[p.key] }));
  if (passes.length < 2) return false;

  const tabsEl = section.querySelector("[data-bd-tabs]");
  const stage = section.querySelector("[data-bd-stage]");
  const modeButtons = [...section.querySelectorAll("[data-bd-mode]")];
  const after = passes[passes.length - 1];

  // ---- Layers: one image per pass, stacked --------------------------------
  const layers = passes.map((p, i) =>
    h("img", {
      class: "bd-layer",
      src: p.src,
      alt: `${title}, ${p.label.toLowerCase()} pass`,
      loading: "lazy",
      decoding: "async",
      width: 1600,
      height: 900,
      "data-pass": p.key,
      "aria-hidden": i === 0 ? null : "true",
    })
  );
  const wipeLine = h("span", { class: "bd-wipe", "aria-hidden": "true" });
  const handle = h(
    "div",
    { class: "bd-handle", role: "slider", tabindex: "0", "aria-label": "Compare position", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "50" },
    h("span", { class: "bd-handle__grip", "aria-hidden": "true" })
  );
  const labelBefore = h("span", { class: "bd-tag bd-tag--before", "aria-hidden": "true" });
  const labelAfter = h("span", { class: "bd-tag bd-tag--after", "aria-hidden": "true", text: after.label });
  stage.append(...layers, wipeLine, handle, labelBefore, labelAfter);

  // ---- Tabs ---------------------------------------------------------------
  const tabs = passes.map((p, i) =>
    h("button", {
      class: "bd-tab",
      type: "button",
      role: "tab",
      id: `bd-tab-${p.key}`,
      "aria-selected": String(i === 0),
      "aria-controls": stage.id,
      tabindex: i === 0 ? "0" : "-1",
      text: p.label,
    })
  );
  tabsEl.append(...tabs);

  let active = 0;       // shown pass in Passes mode / "before" pass in Compare mode
  let mode = "passes";
  let split = 50;       // compare position, percent
  let wipeAnim = null;

  function setLayerState() {
    layers.forEach((layer, i) => {
      const shown = mode === "passes" ? i === active : i === active || i === passes.length - 1;
      layer.classList.toggle("is-shown", shown);
      layer.setAttribute("aria-hidden", String(!(mode === "passes" ? i === active : i === active)));
    });
    labelBefore.textContent = passes[active].label;
    applySplit();
  }

  function applySplit() {
    const before = layers[active];
    layers.forEach((l) => (l.style.clipPath = ""));
    if (mode === "compare") {
      before.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
      before.style.zIndex = 2;
      layers[passes.length - 1].style.zIndex = 1;
      handle.style.left = `${split}%`;
      handle.setAttribute("aria-valuenow", String(Math.round(split)));
      handle.setAttribute("aria-valuetext", `${passes[active].label} ${Math.round(split)}%, ${after.label} ${Math.round(100 - split)}%`);
    }
  }

  async function select(index, { focus = false } = {}) {
    if (mode === "compare" && index === passes.length - 1) return; // "after" side is fixed
    if (index === active && !focus) return;
    const prev = active;
    active = index;
    tabs.forEach((t, i) => {
      t.setAttribute("aria-selected", String(i === index));
      t.tabIndex = i === index ? 0 : -1;
    });
    if (focus) tabs[index].focus();
    if (index === prev) return;

    if (mode === "compare" || reducedMotion) {
      setLayerState();
      return;
    }

    // Passes mode: wipe the new pass over the old one.
    const next = layers[index];
    next.loading = "eager";
    await next.decode().catch(() => {});
    if (active !== index) return; // user moved on while it loaded
    wipeAnim?.cancel();
    layers.forEach((l, i) => (l.style.zIndex = i === index ? 3 : i === prev ? 2 : 1));
    layers[prev].classList.add("is-shown");
    next.classList.add("is-shown");
    const easing = "cubic-bezier(0.65, 0, 0.35, 1)";
    wipeAnim = next.animate([{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: WIPE_MS, easing });
    wipeLine.animate([{ left: "0%", opacity: 1 }, { left: "100%", opacity: 1 }], { duration: WIPE_MS, easing });
    wipeAnim.onfinish = () => setLayerState();
  }

  tabs.forEach((t, i) => t.addEventListener("click", () => select(i)));
  tabsEl.addEventListener("keydown", (e) => {
    const dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (e.key === "Home" || e.key === "End" || dir) {
      e.preventDefault();
      const max = mode === "compare" ? passes.length - 2 : passes.length - 1;
      let i = e.key === "Home" ? 0 : e.key === "End" ? max : active + dir;
      i = Math.max(0, Math.min(max, i));
      select(i, { focus: true });
    }
  });

  // ---- Mode switch ----------------------------------------------------------
  function setMode(next) {
    mode = next;
    section.classList.toggle("is-compare", mode === "compare");
    modeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.bdMode === mode)));
    const finalTab = tabs[passes.length - 1];
    finalTab.disabled = mode === "compare";
    if (mode === "compare") {
      layers.forEach((l) => (l.loading = "eager"));
      if (active === passes.length - 1) {
        active = 0;
        tabs.forEach((t, i) => {
          t.setAttribute("aria-selected", String(i === 0));
          t.tabIndex = i === 0 ? 0 : -1;
        });
      }
      split = 50;
    }
    setLayerState();
  }
  modeButtons.forEach((b) => b.addEventListener("click", () => setMode(b.dataset.bdMode)));

  // ---- Dragging the compare handle ------------------------------------------
  function splitFromEvent(e) {
    const r = stage.getBoundingClientRect();
    split = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    applySplit();
  }
  stage.addEventListener("pointerdown", (e) => {
    if (mode !== "compare") return;
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("is-dragging");
    splitFromEvent(e);
  });
  stage.addEventListener("pointermove", (e) => {
    if (mode === "compare" && stage.hasPointerCapture(e.pointerId)) splitFromEvent(e);
  });
  const endDrag = (e) => {
    if (stage.hasPointerCapture?.(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    stage.classList.remove("is-dragging");
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  handle.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 10 : 2;
    const map = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step };
    if (e.key in map) split = Math.max(0, Math.min(100, split + map[e.key]));
    else if (e.key === "Home") split = 0;
    else if (e.key === "End") split = 100;
    else return;
    e.preventDefault();
    applySplit();
  });

  // First pass loads eagerly-ish once the section is near; the rest stay lazy.
  layers[0].loading = "eager";
  setLayerState();
  return true;
}
