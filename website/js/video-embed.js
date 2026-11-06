/**
 * Shared video helpers for the showreel overlay and project films.
 * A url can be YouTube, Vimeo or a local .mp4 / .webm file.
 */

import { h } from "./case/dom.js";

export function parseVideo(url = "") {
  if (!url || url === "#") return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return { kind: "youtube", id: yt[1] };
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { kind: "vimeo", id: vimeo[1] };
  return { kind: "file", src: url };
}

/** Poster to show before playing: explicit, or YouTube's own thumbnail. */
export function posterFor(info, poster) {
  if (poster) return poster;
  return info?.kind === "youtube" ? `https://i.ytimg.com/vi/${info.id}/hqdefault.jpg` : "";
}

/** Build a playing player element (iframe or <video>). */
export function createPlayer(info, { title = "Video", poster = "", autoplay = true } = {}) {
  const ap = autoplay ? 1 : 0;
  if (info.kind === "youtube") {
    return h("iframe", {
      src: `https://www.youtube-nocookie.com/embed/${info.id}?autoplay=${ap}&rel=0&modestbranding=1&playsinline=1`,
      title,
      allow: "autoplay; encrypted-media; picture-in-picture; fullscreen",
    });
  }
  if (info.kind === "vimeo") {
    return h("iframe", {
      src: `https://player.vimeo.com/video/${info.id}?autoplay=${ap}&dnt=1&title=0&byline=0&portrait=0`,
      title,
      allow: "autoplay; fullscreen; picture-in-picture",
    });
  }
  return h("video", { src: info.src, poster: poster || null, controls: true, autoplay, playsinline: true, preload: "auto", "aria-label": title });
}
