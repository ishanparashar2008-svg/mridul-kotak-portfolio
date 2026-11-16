/**
 * Custom cursor: a small XYZ gizmo, drawn as a real system cursor.
 *
 * The images and hover rules live in css/cursor.css. Because the operating
 * system draws it, it tracks the mouse exactly like the normal pointer, with
 * no delay. This file only switches it on for devices that hover with a fine
 * pointer (mouse, trackpad, pen), and lets 3D scenes ask for the hover look.
 */

const root = document.documentElement;

/**
 * Show the hover gizmo over something that is not a DOM element, e.g. a 3D
 * object under the pointer in the project world.
 */
export function setCursorTarget(on) {
  root.classList.toggle("cursor-target", on);
}

export function initCursor() {
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
  root.classList.toggle("has-custom-cursor", canHover.matches);

  // If the device changes (e.g. a tablet undocked), switch with it.
  canHover.addEventListener?.("change", (e) => root.classList.toggle("has-custom-cursor", e.matches));
}
