/**
 * Site content loader.
 * All copy and project data lives in data/projects.json. If that request
 * fails, the fallback below keeps the page usable (the hero text in
 * index.html already matches it).
 */

const FALLBACK = {
  artist: {
    name: "Mridul Kotak",
    role: "3D Animator & Environment Designer",
    showreel: { url: "#", length: "01:48" },
  },
  projects: [],
};

export async function loadSiteData() {
  try {
    const res = await fetch("data/projects.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return {
      artist: { ...FALLBACK.artist, ...json.artist },
      projects: Array.isArray(json.projects) ? json.projects : [],
    };
  } catch (err) {
    console.warn("[data] Using fallback content:", err.message);
    return FALLBACK;
  }
}
