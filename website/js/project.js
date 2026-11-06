/**
 * Case study page: project.html?id=<slug>
 *
 * Fills every section from data/projects.json and removes the ones a
 * project has no data for. Heavy parts (Three.js turntable and the
 * next-project preview) are imported only when they are about to scroll
 * into view.
 */

import { lite, reducedMotion } from "./device.js";
import { initCursor } from "./cursor.js";
import { initSound, sfx } from "./sound.js";
import { loadSiteData } from "./data.js";
import { h, paragraphs, toolList, whenNear } from "./case/dom.js";
import { renderHeroImage } from "./case/hero-render.js";
import { initBreakdown } from "./case/breakdown.js";
import { initVideo } from "./case/video.js";

initCursor({ reducedMotion });
initSound();

const q = (sel) => document.querySelector(sel);
const section = (name) => q(`[data-section="${name}"]`);
const drop = (name) => section(name)?.remove();
const pageUrl = (p) => `project.html?id=${encodeURIComponent(p.id)}`;

async function init() {
  const { artist, projects } = await loadSiteData();
  const id = new URLSearchParams(window.location.search).get("id");
  const index = projects.findIndex((p) => p.id === id);

  q("[data-brand]").textContent = artist.name;
  initLeaveTransitions();

  if (index < 0) {
    showMissing(artist);
    return;
  }

  const p = projects[index];
  document.title = `${p.title} | ${artist.name}`;
  const description = p.summary || `${p.title} by ${artist.name}`;
  q('meta[name="description"]').content = description;
  setMeta("og:title", document.title);
  setMeta("og:description", description);
  const shareImage = p.hero || p.breakdown?.final || p.cover;
  if (shareImage) setMeta("og:image", new URL(shareImage, window.location.href).href);

  // The page takes the project's colour as its accent. 3D wireframes keep the
  // site's render colour, so remember it first.
  const root = document.documentElement;
  root.style.setProperty("--render-accent", getComputedStyle(root).getPropertyValue("--accent").trim());
  if (p.accent) root.style.setProperty("--accent", p.accent);

  // Back lands on this project in the void, not at the top of the page.
  const voidUrl = `./?p=${encodeURIComponent(p.id)}`;
  q("[data-case-back]").href = voidUrl;
  q("[data-void-link]").href = voidUrl;

  buildHeader(p);
  const heroReady = buildHero(p);
  buildText(p);

  const bdOk = initBreakdown(section("breakdown"), p.breakdown, { title: p.title, reducedMotion });
  if (!bdOk) drop("breakdown");

  if (p.model) {
    whenNear(section("model"), async () => {
      try {
        const { initTurntable } = await import("./case/turntable.js");
        initTurntable(section("model"), { src: p.model, alt: p.modelAlt || `${p.title}, interactive 3D model`, reducedMotion, lite });
      } catch (err) {
        console.warn("[turntable]", err);
        drop("model");
      }
    });
  } else drop("model");

  if (!initVideo(section("video"), p.video, { title: p.title })) drop("video");
  buildGallery(p);
  buildNext(projects, index);

  document.body.classList.add("is-ready");
  await heroReady;
}

// ---------------------------------------------------------------------------
// Header: title, year, role, client, software
// ---------------------------------------------------------------------------
function buildHeader(p) {
  q("[data-case-title]").textContent = p.title;
  q("[data-case-summary]").textContent = p.summary || "";
  if (!p.summary) q("[data-case-summary]").remove();

  const tools = toolList(p.tools).map((t) => t.name);
  const rows = [
    ["Year", p.year],
    ["Role", p.role],
    ["Client", p.client],
    ["Software", tools.join(", ")],
  ].filter(([, v]) => v);
  const meta = q("[data-case-meta]");
  rows.forEach(([k, v]) => meta.append(h("div", {}, h("dt", { text: k }), h("dd", { text: String(v) }))));
  if (!rows.length) meta.remove();
}

// ---------------------------------------------------------------------------
// Hero image: wireframe pass underneath, final image renders in over it
// ---------------------------------------------------------------------------
function buildHero(p) {
  const src = p.hero || p.breakdown?.final || p.cover;
  const frame = q("[data-hero-frame]");
  if (!src) {
    frame.remove();
    return Promise.resolve();
  }
  const img = q("[data-hero-img]");
  img.alt = p.heroAlt || `${p.title}, final render`;
  img.src = src;
  return renderHeroImage({
    frame,
    img,
    canvas: q("[data-hero-canvas]"),
    readout: q("[data-hero-readout]"),
    underSrc: p.breakdown?.wireframe,
    reducedMotion,
  });
}

// ---------------------------------------------------------------------------
// Brief, process, tools
// ---------------------------------------------------------------------------
function buildText(p) {
  const brief = paragraphs(p.brief);
  if (brief.length) q("[data-brief]").append(...brief.map((t) => h("p", { text: t })));
  else drop("brief");

  // Process: [{ title, text }] as a numbered list, or plain paragraphs.
  const proc = q("[data-process]");
  if (Array.isArray(p.process) && p.process.some((s) => typeof s === "object")) {
    const list = h("ol", { class: "steps" });
    p.process.forEach((s) => {
      const step = typeof s === "string" ? { text: s } : s;
      list.append(h("li", { class: "step" }, step.title ? h("h3", { class: "step__title", text: step.title }) : null, h("p", { text: step.text || "" })));
    });
    proc.append(list);
  } else if (paragraphs(p.process).length) {
    proc.append(...paragraphs(p.process).map((t) => h("p", { text: t })));
  } else drop("process");

  // Tools section only earns its place when there is more than the names
  // already listed in the header.
  const tools = toolList(p.tools);
  if (tools.some((t) => t.use)) {
    const dl = q("[data-tools]");
    tools.forEach((t) => dl.append(h("div", { class: "tool" }, h("dt", { text: t.name }), h("dd", { text: t.use }))));
  } else drop("tools");
}

// ---------------------------------------------------------------------------
// Gallery: full and half width, each image wipes in as it enters
// ---------------------------------------------------------------------------
function buildGallery(p) {
  const items = (p.gallery || []).filter((g) => g && (g.src || typeof g === "string"));
  if (!items.length) {
    drop("gallery");
    return;
  }
  const grid = q("[data-gallery]");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px" }
  );

  items.forEach((g) => {
    const item = typeof g === "string" ? { src: g } : g;
    const layout = item.layout === "half" ? "half" : "full";
    const img = h("img", {
      src: item.src,
      alt: item.alt || `${p.title}, still`,
      loading: "lazy",
      decoding: "async",
      width: layout === "full" ? 1600 : 1200,
      height: 900,
    });
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    const fig = h("figure", { class: `shot shot--${layout}` }, img, item.caption ? h("figcaption", { text: item.caption }) : null);
    grid.append(fig);
    if (reducedMotion) fig.classList.add("is-in");
    else io.observe(fig);
  });
}

// ---------------------------------------------------------------------------
// Footer: next project (with its object from the void) and back to the void
// ---------------------------------------------------------------------------
function buildNext(projects, index) {
  if (projects.length < 2) {
    q("[data-next-link]").remove();
    q(".next__preview").remove();
    return;
  }
  const next = projects[(index + 1) % projects.length];
  const link = q("[data-next-link]");
  link.href = pageUrl(next);
  q("[data-next-title]").textContent = next.title;
  q("[data-next-meta]").textContent = [next.type || next.discipline, next.year].filter(Boolean).join(" / ");
  link.style.setProperty("--next-accent", next.accent || "var(--fg)");

  const canvas = q("[data-next-canvas]");
  const thumb = q("[data-next-thumb]");
  const thumbSrc = next.cover || next.hero || next.breakdown?.final;

  whenNear(section("next"), async () => {
    try {
      if (lite) throw new Error("lite mode: still image instead of live 3D");
      const { initNextPreview } = await import("./case/next-preview.js");
      initNextPreview(canvas, next, { trigger: link, reducedMotion });
      thumb.remove();
    } catch (err) {
      // No WebGL: fall back to a still of the next project.
      if (!lite) console.warn("[next preview]", err);
      canvas.remove();
      if (thumbSrc) thumb.src = thumbSrc;
      else thumb.remove();
    }
  });
}

// ---------------------------------------------------------------------------
// Leaving: fade to the void colour, then navigate (mirrors the fly-in)
// ---------------------------------------------------------------------------
function initLeaveTransitions() {
  const fade = q("[data-page-fade]");
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-leave]");
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (reducedMotion) return;
    e.preventDefault();
    sfx.whoosh();
    fade.classList.add("is-on");
    setTimeout(() => (window.location.href = a.href), 420);
  });
  // Back/forward cache: never come back to a faded-out page.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) fade.classList.remove("is-on");
  });
}

function setMeta(property, content) {
  const el = document.querySelector(`meta[property="${property}"]`);
  if (el) el.content = content;
}

function showMissing(artist) {
  document.title = `Not found | ${artist.name}`;
  q("[data-case-title]").textContent = "Missing mesh";
  q("[data-case-summary]").textContent = "This project is not in the scene. It may have been renamed or removed.";
  q("[data-case-meta]").remove();
  q("[data-hero-frame]").remove();
  document.querySelectorAll("[data-section]").forEach((s) => s.remove());
  document.body.classList.add("is-ready");
}

init();
