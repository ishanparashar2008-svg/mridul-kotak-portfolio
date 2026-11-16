/**
 * Full-screen showreel overlay, built on the native <dialog> element:
 * Esc closes it, focus is trapped inside while open and returns to the
 * button afterwards. Clicking the dark area around the video also closes it.
 *
 * The player is created on open and destroyed on close, so the video stops
 * and nothing loads until someone asks for it.
 */

import { parseVideo, createPlayer } from "./video-embed.js";

export function initShowreel(trigger, showreel) {
  const dialog = document.querySelector("[data-reel]");
  const frame = dialog?.querySelector("[data-reel-frame]");
  const closeBtn = dialog?.querySelector("[data-reel-close]");
  const info = parseVideo(showreel?.url);

  // No reel yet: hide the button rather than show a dead link.
  if (!dialog || !info) {
    trigger?.closest("[data-hero-reel]")?.setAttribute("hidden", "");
    return;
  }

  const title = showreel.title || "Showreel";

  function open(e) {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) return; // new tab: let the link work
    e?.preventDefault();
    const player = createPlayer(info, { title });
    player.classList.add("reel__player");
    frame.replaceChildren(player);
    dialog.showModal();
    document.documentElement.classList.add("is-reel-open");
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  dialog.addEventListener("close", () => {
    frame.replaceChildren(); // stops playback
    document.documentElement.classList.remove("is-reel-open");
  });

  // Click outside the video (on the dimmed backdrop area) closes.
  dialog.addEventListener("click", (e) => {
    if (!frame.contains(e.target) && !closeBtn.contains(e.target)) close();
  });

  closeBtn.addEventListener("click", close);
  trigger.addEventListener("click", open);
}
