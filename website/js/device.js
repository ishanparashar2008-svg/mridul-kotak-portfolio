/**
 * Device profile, decided once per page load.
 *
 * "Lite" mode swaps the heavy live 3D for lighter versions: a low-poly hero,
 * a vertical list of project cards instead of the flight through the void,
 * and a still instead of the 3D next-project preview.
 *
 * Lite when any of these is true:
 *  - a phone-sized screen (760px wide or less)
 *  - the browser asks to save data
 *  - a touch device that also looks low-powered (4 or fewer CPU cores,
 *    or 4 GB of memory or less)
 *
 * Testing overrides: add ?lite or ?full to the URL.
 */

function detectLite() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("lite")) return true;
  if (params.has("full")) return false;

  const small = window.matchMedia("(max-width: 760px)").matches;
  const saveData = navigator.connection?.saveData === true;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const fewCores = (navigator.hardwareConcurrency || 8) <= 4;
  const lowMemory = (navigator.deviceMemory || 8) <= 4;
  return small || saveData || (coarse && (fewCores || lowMemory));
}

export const lite = detectLite();
export const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Device pixel ratio cap: 2 normally, 1.5 in lite mode. */
export const maxPixelRatio = () => Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);

if (lite) document.documentElement.classList.add("is-lite");
