/**
 * Custom cursor: a small XYZ gizmo that eases behind the pointer and grows
 * over anything interactive.
 *
 * Only runs for devices that can hover with a fine pointer (mouse, trackpad,
 * pen). On touch devices it never activates and the page behaves normally.
 */

const INTERACTIVE = 'a, button, [role="button"], input, select, textarea, label, [data-cursor="hover"]';

let cursorEl = null;

/**
 * Grow the gizmo over something that is not a DOM element, e.g. a 3D object
 * under the pointer. Separate class from DOM hover so the two never fight.
 */
export function setCursorTarget(on) {
  cursorEl?.classList.toggle("is-target", on);
}

export function initCursor({ reducedMotion = false } = {}) {
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  const el = document.querySelector("[data-cursor]");
  if (!el || !canHover.matches) return;
  cursorEl = el;

  document.documentElement.classList.add("has-custom-cursor");

  // Target = real pointer, pos = where the gizmo is drawn.
  const target = { x: -100, y: -100 };
  const pos = { x: -100, y: -100 };
  let seen = false;
  let rafId = 0;
  let last = performance.now();

  // Easing strength per 60fps frame; made frame-rate independent below.
  const FOLLOW = reducedMotion ? 1 : 0.2;

  function loop(now) {
    const dt = Math.min((now - last) / 16.667, 4);
    last = now;
    const k = 1 - Math.pow(1 - FOLLOW, dt);
    pos.x += (target.x - pos.x) * k;
    pos.y += (target.y - pos.y) * k;
    el.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0)`;

    // Sleep when settled; the next pointermove wakes it up.
    if (Math.abs(target.x - pos.x) < 0.05 && Math.abs(target.y - pos.y) < 0.05) {
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function wake() {
    if (!rafId) {
      last = performance.now();
      rafId = requestAnimationFrame(loop);
    }
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      target.x = e.clientX;
      target.y = e.clientY;
      if (!seen) {
        // First move: jump straight there instead of flying in from a corner.
        pos.x = target.x;
        pos.y = target.y;
        seen = true;
      }
      el.classList.add("is-visible");
      wake();
    },
    { passive: true }
  );

  // Hover state via delegation, so elements added later just work.
  document.addEventListener("pointerover", (e) => {
    if (e.target.closest?.(INTERACTIVE)) el.classList.add("is-hover");
  });
  document.addEventListener("pointerout", (e) => {
    const from = e.target.closest?.(INTERACTIVE);
    const to = e.relatedTarget?.closest?.(INTERACTIVE);
    if (from && from !== to) el.classList.remove("is-hover");
  });

  window.addEventListener("pointerdown", () => el.classList.add("is-down"));
  window.addEventListener("pointerup", () => el.classList.remove("is-down"));

  // Hide when the pointer leaves the window.
  document.documentElement.addEventListener("pointerleave", () => el.classList.remove("is-visible"));
  document.documentElement.addEventListener("pointerenter", () => seen && el.classList.add("is-visible"));

  // If the device changes (e.g. a tablet undocked), fall back to the system cursor.
  canHover.addEventListener?.("change", (e) => {
    document.documentElement.classList.toggle("has-custom-cursor", e.matches);
  });
}
