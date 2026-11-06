/**
 * Tiny DOM helpers for the case study page. Text always goes in through
 * textContent, so nothing from the JSON is ever parsed as HTML.
 */

/** h("p", { class: "x", text: "hi" }, child, child) */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) if (child != null) el.append(child);
  return el;
}

/** A string or array of strings as paragraphs (blank lines split a string). */
export function paragraphs(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(/\n\s*\n/);
  return list.map((t) => String(t).trim()).filter(Boolean);
}

/** Tools can be ["Blender"] or [{ name, use }]. Always returns [{ name, use }]. */
export function toolList(tools) {
  return (tools || []).map((t) => (typeof t === "string" ? { name: t, use: "" } : { name: t.name, use: t.use || "" }));
}

/** Run fn once when el comes within `margin` of the viewport. */
export function whenNear(el, fn, margin = "300px") {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        fn();
      }
    },
    { rootMargin: margin }
  );
  io.observe(el);
}
