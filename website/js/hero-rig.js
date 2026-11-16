/**
 * The hero's stage, shared by everything that has to line up with it:
 *  - js/scene.js        the live 3D (wireframe and clay modes)
 *  - the final-mode PNGs (each model rendered at the front slot)
 *  - the environment PNGs (one per mode, rendered with no models)
 *  - tools/placeholders/hero.html, which renders placeholder versions of both
 *
 * Mridul's Blender renders must use these exact numbers (see
 * mridul/HERO-RENDERS.md). Units are metres, Y up (three.js / glTF).
 *
 * Every picture is made at the design frame (1920x1080). On other screen
 * shapes the PNGs are cropped like CSS background-size: cover, and the 3D
 * camera narrows its field of view to match (see coverFov), so the live
 * models stay glued to the backgrounds at any window size.
 */

export const HERO_RIG = {
  design: { width: 1920, height: 1080 },

  // Vertical field of view at the design frame, in degrees.
  camera: { fov: 30, position: [-1.35, 2.5, 15.5], target: [-1.35, 1.3, 0] },

  floorY: 0,

  // The carousel: three slots on a circle, 120 degrees apart. Slot angle 0 is
  // the front (nearest the camera); positive angles go round to the right.
  carousel: { center: [0, 0, 0], radius: 3.4, sideScale: 0.8 },

  // Each model is scaled to fit inside this box and stood on the floor.
  model: { height: 3.6, width: 2.6 },
};

const DEG = Math.PI / 180;

/** World position of a point on the carousel at `angleDeg` (0 = front). */
export function slotPosition(angleDeg) {
  const { center, radius } = HERO_RIG.carousel;
  const a = angleDeg * DEG;
  return [center[0] + radius * Math.sin(a), HERO_RIG.floorY, center[2] + radius * Math.cos(a)];
}

/** 1 at the front slot, 0 at the two back slots (and anywhere further round). */
export function focusAt(angleDeg) {
  // cos is 1 at the front and -0.5 at the back slots (+-120deg); remap that to 1..0.
  return Math.min(1, Math.max(0, (Math.cos(angleDeg * DEG) + 0.5) / 1.5));
}

/** Model scale at an angle: full size at the front, sideScale at the back slots. */
export function scaleAt(angleDeg) {
  const s = HERO_RIG.carousel.sideScale;
  return s + (1 - s) * focusAt(angleDeg);
}

/** Vertical FOV for a viewport aspect, matching background-size: cover of the design frame. */
export function coverFov(aspect) {
  const { width, height } = HERO_RIG.design;
  const designAspect = width / height;
  if (aspect <= designAspect) return HERO_RIG.camera.fov; // taller: sides are cropped
  const t = Math.tan((HERO_RIG.camera.fov / 2) * DEG) * (designAspect / aspect);
  return (2 * Math.atan(t)) / DEG; // wider: top and bottom are cropped
}

/** Starting angle of model i (model 0 at the front, 1 on the left, 2 on the right). */
export function startAngle(i) {
  return [0, -120, 120][i % 3];
}
