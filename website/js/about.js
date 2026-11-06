/**
 * About + Contact, filled from data/projects.json (artist block).
 *
 * The portrait waits as its wireframe pass until it scrolls into view, then
 * renders in bucket by bucket (same renderer as the project heroes).
 * The email copies to the clipboard with a small "Copied" toast.
 */

import { h, paragraphs, whenNear } from "./case/dom.js";
import { renderHeroImage } from "./case/hero-render.js";

const q = (sel) => document.querySelector(sel);

export function initAbout({ artist, reducedMotion = false }) {
  const section = q("[data-about]");
  if (!section) return;

  // The heading renders in (outline to solid) once it is on screen.
  const title = section.querySelector(".section-title");
  if (title) whenNear(title, () => title.classList.add("is-in"), "0px 0px -25% 0px");

  // ---- Bio ------------------------------------------------------------------
  const bio = paragraphs(artist.bio);
  const bioEl = q("[data-bio]");
  if (bio.length) bioEl.append(...bio.map((t) => h("p", { text: t })));
  else bioEl.remove();

  // ---- Portrait: wireframe until in view, then renders -----------------------
  const frame = q("[data-portrait]");
  const portrait = artist.portrait;
  if (portrait?.src) {
    const img = frame.querySelector("[data-portrait-img]");
    img.alt = portrait.alt || `Portrait of ${artist.name}`;
    // The wireframe "waiting" pass loads only as About approaches (not on page load).
    // Absolute URL: a url() inside a custom property resolves against the stylesheet that uses it.
    if (portrait.wireframe) {
      whenNear(frame, () => frame.style.setProperty("--wire", `url("${new URL(portrait.wireframe, window.location.href).href}")`), "900px");
    }
    whenNear(
      frame,
      () => {
        img.src = portrait.src;
        renderHeroImage({
          frame,
          img,
          canvas: frame.querySelector("[data-portrait-canvas]"),
          readout: frame.querySelector("[data-portrait-readout]"),
          underSrc: portrait.wireframe,
          reducedMotion,
        });
      },
      "0px 0px -20% 0px" // start once it is properly on screen
    );
  } else frame.remove();

  // ---- Render settings (skills) -----------------------------------------------
  const skills = artist.skills || [];
  const list = q("[data-skills]");
  if (skills.length) {
    skills.forEach((s) =>
      list.append(
        h("div", { class: "setting" },
          h("dt", { class: "setting__name", text: s.name }),
          h("span", { class: "setting__leader", "aria-hidden": "true" }),
          h("dd", { class: "setting__value", text: s.level || "" })
        )
      )
    );
  } else q("[data-settings]").remove();

  // ---- Experience ----------------------------------------------------------------
  const exp = artist.experience || [];
  const expList = q("[data-experience]");
  if (exp.length) {
    exp.forEach((e) =>
      expList.append(
        h("li", { class: "job" },
          h("span", { class: "job__years", text: e.years || "" }),
          h("span", { class: "job__role", text: e.role || "" }),
          h("span", { class: "job__company", text: e.company || "" })
        )
      )
    );
  } else q("[data-experience-block]").remove();

  // ---- Clients -------------------------------------------------------------------
  const clients = artist.clients || [];
  if (clients.length) q("[data-clients]").append(...clients.map((c) => h("li", { text: c })));
  else q("[data-clients-block]").remove();
}

export function initContact({ artist }) {
  const section = q("[data-contact]");
  if (!section) return;

  const availability = q("[data-availability]");
  if (artist.availability) availability.textContent = artist.availability;
  else availability.remove();

  // ---- Email: click to copy ------------------------------------------------------
  const email = artist.email;
  const btn = q("[data-copy-email]");
  const mailLink = q("[data-mailto]");
  if (email) {
    q("[data-email-text]").textContent = email;
    mailLink.href = `mailto:${email}`;
    btn.addEventListener("click", async () => {
      const ok = await copyText(email);
      toast(ok ? "Copied to clipboard" : `Copy failed. ${email}`);
    });
  } else {
    btn.remove();
    mailLink.remove();
  }

  // ---- Phone: tap to call ------------------------------------------------------------
  const phoneLink = q("[data-phone]");
  if (artist.phone) {
    q("[data-phone-text]").textContent = artist.phone;
    phoneLink.href = `tel:${artist.phone.replace(/[^\d+]/g, "")}`;
  } else phoneLink.remove();

  // ---- Socials --------------------------------------------------------------------
  const socials = (artist.socials || []).filter((s) => s.label);
  const list = q("[data-socials]");
  socials.forEach((s) => {
    const external = /^https?:/.test(s.url || "");
    list.append(
      h("li", {},
        h("a", {
          class: "social",
          href: s.url || "#",
          target: external ? "_blank" : null,
          rel: external ? "noopener noreferrer" : null,
        },
          h("span", { text: s.label }),
          h("span", { class: "social__arrow", "aria-hidden": "true", text: "↗" })
        )
      )
    );
  });
  if (!socials.length) list.remove();

  q("[data-year]").textContent = new Date().getFullYear();
  q("[data-footer-name]").textContent = artist.name;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts
    const ta = h("textarea", { style: "position:fixed;opacity:0", readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

let toastTimer = 0;
function toast(message) {
  const el = q("[data-toast]");
  if (!el) return;
  el.textContent = message;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
}
