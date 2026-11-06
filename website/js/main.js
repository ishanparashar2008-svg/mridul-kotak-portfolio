/**
 * Entry point.
 *
 * Boot order is deliberate: the loader, cursor and sound toggle are tiny and
 * start at once, then the heavy parts (Three.js + GSAP, pulled in by hero.js
 * and work.js) load behind the loader with dynamic imports. That way the
 * "render" readout is on screen immediately.
 */

import { lite, reducedMotion } from "./device.js";
import { createLoader } from "./loader.js";
import { initCursor } from "./cursor.js";
import { initSound } from "./sound.js";
import { loadSiteData } from "./data.js";

const root = document.documentElement;
root.classList.add("js");

// Coming back from a project page (?p=slug) lands back at that project.
const params = new URLSearchParams(window.location.search);
const returnTo = params.get("p");

// We restore positions ourselves; stop the browser jumping around first.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// Full render theatre on the first visit of a session, a short one after that.
let repeatVisit = false;
try {
  repeatVisit = sessionStorage.getItem("render:seen") === "1";
  sessionStorage.setItem("render:seen", "1");
} catch {
  /* storage blocked: always show the full loader */
}

// Six real steps feed the loader: data, fonts, 3D libraries, hero, work, about.
const loader = createLoader({ reducedMotion, steps: 6, minDuration: repeatVisit ? 700 : 2600 });
initCursor({ reducedMotion });
initSound();

/** Smooth-scroll in-page links (#about, #contact, #main). #work is handled by work.js. */
function initAnchorLinks() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute("href") === "#work" || a.hasAttribute("data-hero-reel")) return;
    const target = document.getElementById(a.getAttribute("href").slice(1));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
    if (target.id === "main") document.querySelector(".brand")?.focus({ preventScroll: true });
  });
}

async function boot() {
  const data = await loader.step(loadSiteData());
  loader.setSceneLabel(`${data.projects.length} objects`);

  const fontsReady = loader.step(document.fonts ? document.fonts.ready : Promise.resolve());
  const [{ initHero }, { initWork }, { initAbout, initContact }] = await loader.step(
    Promise.all([import("./hero.js"), import("./work.js"), import("./about.js")])
  );
  const hero = await loader.step(initHero({ data, reducedMotion }));
  const work = await loader.step(initWork({ data, reducedMotion, lite }));
  await loader.step(
    Promise.resolve().then(() => {
      initAbout({ artist: data.artist, reducedMotion });
      initContact({ artist: data.artist });
    })
  );
  initAnchorLinks();
  await fontsReady;

  await loader.finish(); // resolves as the loader starts fading out
  root.classList.remove("is-loading");
  work.refresh(); // layout is final now (fonts, scrollbar)

  // Arriving with ?p=slug (back from a project) or a #hash (header link on another page).
  const hash = window.location.hash.slice(1);
  let landed = false;
  if (returnTo) landed = work.jumpTo(returnTo);
  else if (hash === "work") landed = work.jumpTo(data.projects[0]?.id);
  else if (hash && document.getElementById(hash)) {
    document.getElementById(hash).scrollIntoView({ behavior: "instant", block: "start" });
    landed = true;
  }
  if (returnTo) history.replaceState(null, "", window.location.pathname);
  hero.play({ skipIntro: Boolean(landed) });

  // The cathedral sequence loads last, so its frames never compete with the loader or the hero.
  import("./making.js")
    .then(({ initMaking }) => initMaking({ reducedMotion, after: hero.ready }))
    .catch((err) => console.warn("[making]", err));
}

boot().catch((err) => {
  // Never leave someone stuck behind the loader.
  console.error("[boot]", err);
  loader.finish({ immediate: true });
  root.classList.remove("is-loading");
});
