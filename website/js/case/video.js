/**
 * Project film: a lightweight "facade" (poster + custom play button) that
 * only loads the real player when clicked. Nothing heavy downloads until
 * the viewer asks for it.
 *
 * video.url can be a YouTube link, a Vimeo link, or a local .mp4 / .webm.
 */

import { h } from "./dom.js";
import { parseVideo, posterFor, createPlayer } from "../video-embed.js";

export function initVideo(section, video, { title }) {
  const info = parseVideo(video?.url);
  if (!info) return false;

  const frame = section.querySelector("[data-video-frame]");
  const caption = section.querySelector("[data-video-caption]");
  const label = video.title || `${title}, film`;
  if (video.title) caption.textContent = video.title;
  else caption.remove();

  const posterSrc = posterFor(info, video.poster);
  const poster = posterSrc
    ? h("img", { class: "video__poster", src: posterSrc, alt: "", loading: "lazy", decoding: "async", width: 1600, height: 900 })
    : null;

  const play = h(
    "button",
    { class: "video__play", type: "button", "aria-label": `Play ${label}` },
    h("span", { class: "video__play-icon", "aria-hidden": "true" }),
    h("span", { class: "video__play-label", text: "Play film" })
  );

  frame.append(...[poster, play].filter(Boolean));

  play.addEventListener("click", () => {
    const player = createPlayer(info, { title: label, poster: posterSrc });
    player.classList.add("video__player");
    frame.replaceChildren(player);
    frame.classList.add("is-playing");
    player.focus?.();
  });

  return true;
}
