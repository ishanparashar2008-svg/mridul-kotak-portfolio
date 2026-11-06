/**
 * "The work" section: glues the project world to the page.
 *
 * Full mode:
 * - Builds the section height, the mini index, counter and label from data
 * - Maps scroll to camera progress with ScrollTrigger
 * - Keyboard: Tab through the project links; focusing one flies the camera
 *   to it, Enter flies into it
 * - Hover cursor, clicks, the fly-in page transition, coming back from a
 *   project page (fresh load and bfcache restore)
 *
 * Lite mode (phones, low-power devices, see device.js): no 3D here at all.
 * A vertical list of project cards, each rendering in as it scrolls into view.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { setCursorTarget } from "./cursor.js";
import { sfx } from "./sound.js";
import { h } from "./case/dom.js";

gsap.registerPlugin(ScrollTrigger);

const pad = (n) => String(n).padStart(2, "0");
export const projectUrl = (p) => `project.html?id=${encodeURIComponent(p.id)}`;
const q = (sel) => document.querySelector(sel);

export async function initWork({ data, reducedMotion = false, lite = false }) {
  const projects = data.projects;
  const section = q("[data-work]");
  if (!section || !projects.length) {
    section?.remove();
    return { jumpTo() {}, refresh() {} };
  }
  q("[data-world-count]").textContent = `${projects.length} projects`;

  // Any "#work" link (header, hero) glides to the work.
  const bindWorkLinks = (go) =>
    document.querySelectorAll('a[href="#work"]').forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        go();
      })
    );

  if (lite) return initCards({ projects, section, reducedMotion, bindWorkLinks });
  return initWorldMode({ projects, section, reducedMotion, bindWorkLinks });
}

// ===========================================================================
// Lite mode: project cards
// ===========================================================================
function initCards({ projects, section, reducedMotion, bindWorkLinks }) {
  const list = q("[data-cards]");
  const intro = q("[data-world-intro]");
  section.insertBefore(intro, list); // the "Selected work" heading, out of the 3D stage
  list.hidden = false;
  q("[data-world-links]").closest("nav")?.remove(); // cards are already plain links

  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }),
    { rootMargin: "0px 0px -15% 0px" }
  );

  const cards = projects.map((p, i) => {
    const finalSrc = p.hero || p.breakdown?.final || p.cover;
    const wireSrc = p.breakdown?.wireframe;
    const media = h("div", { class: "card__media" },
      wireSrc ? h("img", { class: "card__wire", src: wireSrc, alt: "", loading: "lazy", decoding: "async", width: 1600, height: 900 }) : null,
      finalSrc ? h("img", { class: "card__final", src: finalSrc, alt: p.heroAlt || `${p.title}, final render`, loading: "lazy", decoding: "async", width: 1600, height: 900 }) : null
    );
    const card = h("li", { class: "card", id: `card-${p.id}` },
      h("a", { class: "card__link", href: projectUrl(p), "data-leave": "" },
        media,
        h("div", { class: "card__text" },
          h("span", { class: "card__num", text: pad(i + 1) }),
          h("h3", { class: "card__title", text: p.title }),
          h("p", { class: "card__meta", text: [p.type || p.discipline, p.year].filter(Boolean).join(" / ") })
        )
      )
    );
    list.append(card);
    if (reducedMotion || !wireSrc) card.classList.add("is-in");
    else io.observe(card);
    return card;
  });

  // Leaving for a project: fade to the void colour first, like the fly-in.
  const fade = q("[data-page-fade]");
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-leave]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || reducedMotion) return;
    e.preventDefault();
    gsap.to(fade, { autoAlpha: 1, duration: 0.4, ease: "power1.in", onComplete: () => (window.location.href = a.href) });
  });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) gsap.set(fade, { autoAlpha: 0 });
  });

  const scrollToCard = (el, instant) =>
    el.scrollIntoView({ behavior: instant || reducedMotion ? "instant" : "smooth", block: "start" });
  bindWorkLinks(() => scrollToCard(section));

  return {
    jumpTo(slug) {
      const i = projects.findIndex((p) => p.id === slug);
      if (i < 0) return false;
      cards[i].classList.add("is-in");
      scrollToCard(cards[i], true);
      return true;
    },
    refresh() {},
  };
}

// ===========================================================================
// Full mode: the 3D world
// ===========================================================================
async function initWorldMode({ projects, section, reducedMotion, bindWorkLinks }) {
  const { createWorld } = await import("./world.js");

  const canvas = q("[data-world-canvas]");
  const ui = q("[data-world-ui]");
  const counterNow = q("[data-counter-now]");
  const counterTotal = q("[data-counter-total]");
  const activeTitle = q("[data-active-title]");
  const openLink = q("[data-active-open]");
  const indexList = q("[data-index-list]");
  const indexToggle = q("[data-index-toggle]");
  const topBtn = q("[data-to-top]");
  const intro = q("[data-world-intro]");
  const fade = q("[data-page-fade]");
  const keyList = q("[data-world-links]");

  // Scroll length grows with the number of projects.
  section.style.setProperty("--stops", projects.length);
  counterTotal.textContent = pad(projects.length);

  // ---- Index menu --------------------------------------------------------------
  const indexButtons = projects.map((p, i) => {
    const btn = h("button", { class: "index__item", type: "button" },
      h("span", { class: "index__num", text: pad(i + 1) }),
      h("span", { class: "index__name", text: p.title })
    );
    btn.addEventListener("click", () => {
      goToProject(i);
      ui.classList.remove("is-index-open");
      indexToggle.setAttribute("aria-expanded", "false");
    });
    indexList.append(h("li", {}, btn));
    return btn;
  });

  indexToggle.addEventListener("click", () => {
    const open = !ui.classList.contains("is-index-open");
    ui.classList.toggle("is-index-open", open);
    indexToggle.setAttribute("aria-expanded", String(open));
  });

  // ---- The 3D world ----------------------------------------------------------------
  let active = 0;
  const world = createWorld(canvas, {
    projects,
    reducedMotion,
    labelEl: q("[data-world-label]"),
    onActiveChange: (i) => {
      active = i;
      counterNow.textContent = pad(i + 1);
      activeTitle.textContent = projects[i].title;
      openLink.href = projectUrl(projects[i]);
      indexButtons.forEach((b, j) => b.setAttribute("aria-current", j === i ? "true" : "false"));
    },
    onHoverChange: (i) => {
      setCursorTarget(i >= 0);
      canvas.classList.toggle("is-pointing", i >= 0);
      if (i >= 0) sfx.hover();
    },
    onFlyStart: () => {
      document.documentElement.classList.add("is-flying");
      ui.classList.remove("is-visible");
      sfx.whoosh();
    },
  });
  // The project models are small; give them a moment so the void opens on them
  // rather than swapping in the stand-in primitives. Never wait long.
  await Promise.race([world.modelsReady, new Promise((r) => setTimeout(r, 4000))]);
  world.warmUp();

  // ---- Scroll -> camera progress ------------------------------------------------------
  const st = ScrollTrigger.create({
    trigger: section,
    start: "top top",
    end: "bottom bottom",
    onUpdate: (self) => {
      world.setProgress(self.progress);
      // The "Selected work" title fades as the flight begins.
      const t = Math.min(1, self.progress / (world.stops[0] * 0.55));
      intro.style.opacity = String(1 - t);
      intro.style.transform = `translate3d(0, ${(-t * 30).toFixed(1)}px, 0)`;
    },
  });

  // The overlay shows while the world fills the screen, and hides again once
  // you scroll on to About.
  ScrollTrigger.create({
    trigger: section,
    start: "top 35%",
    end: "bottom 65%",
    onToggle: (self) => ui.classList.toggle("is-visible", self.isActive),
  });

  function scrollYFor(index) {
    return st.start + world.stops[index] * (st.end - st.start);
  }

  function goToProject(index, { instant = false } = {}) {
    window.scrollTo({ top: scrollYFor(index), behavior: instant || reducedMotion ? "instant" : "smooth" });
    if (instant) world.setProgress(world.stops[index], { instant: true });
  }

  topBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" }));
  bindWorkLinks(() => goToProject(0));

  // ---- Keyboard: Tab through projects ------------------------------------------------
  projects.forEach((p, i) => {
    const a = h("a", { href: projectUrl(p), text: `${pad(i + 1)}  ${p.title}, ${p.type || p.discipline}, ${p.year}` });
    a.addEventListener("focus", () => {
      goToProject(i);
      world.setFocus(i);
    });
    a.addEventListener("blur", () => world.setFocus(-1));
    a.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      openProject(i);
    });
    keyList.append(h("li", {}, a));
  });

  // ---- Pointer ---------------------------------------------------------------------------
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      world.setPointer((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    },
    { passive: true }
  );

  // Click (or tap) an object to fly into it.
  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const i = world.pick(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    if (i >= 0) {
      sfx.click();
      openProject(i);
    }
  });

  openLink.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // let new-tab clicks through
    e.preventDefault();
    openProject(active);
  });

  // ---- Fly-in page transition --------------------------------------------------------------
  function openProject(i) {
    const url = projectUrl(projects[i]);
    setCursorTarget(false);
    world.open(i, {
      onArrive: () => {
        gsap.to(fade, {
          autoAlpha: 1,
          duration: reducedMotion ? 0 : 0.45,
          ease: "power1.in",
          onComplete: () => (window.location.href = url),
        });
      },
    });
  }

  // Back button with bfcache: the page comes back exactly as we left it,
  // mid-flight and faded out. Undo that.
  window.addEventListener("pageshow", (e) => {
    if (!e.persisted) return;
    document.documentElement.classList.remove("is-flying");
    world.resetFlight();
    gsap.to(fade, { autoAlpha: 0, duration: 0.5, ease: "power1.out" });
    ScrollTrigger.refresh();
    world.setProgress(st.progress, { instant: true });
  });

  return {
    /** Jump straight to a project by slug (used when returning from its page). */
    jumpTo(slug) {
      const i = projects.findIndex((p) => p.id === slug);
      if (i < 0) return false;
      goToProject(i, { instant: true });
      world.renderNow(i);
      return true;
    },
    refresh: () => ScrollTrigger.refresh(),
  };
}
