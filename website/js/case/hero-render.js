/**
 * Entry transition for the case study hero image: a progressive "bucket"
 * render, like a path tracer filling tiles.
 *
 * The wireframe pass (if there is one) is drawn first. Tiles then spiral out
 * from the centre: each one shows a coarse, pixelated sample with bucket
 * brackets, then resolves to the full-resolution final image. When every
 * tile is done the canvas fades away, leaving the real <img> underneath.
 */

const SAMPLE_MS = 110;     // how long a tile shows its coarse sample
const TILE_STAGGER = 38;   // ms between tiles starting

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Source rect that reproduces CSS object-fit: cover for a w x h box. */
function coverRect(img, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s;
  const sh = h / s;
  return { sx: (img.naturalWidth - sw) / 2, sy: (img.naturalHeight - sh) / 2, scale: 1 / s };
}

export async function renderHeroImage({ frame, img, canvas, readout, underSrc, reducedMotion = false }) {
  const done = () => {
    frame.classList.add("is-rendered");
    canvas.remove();
    readout?.remove();
  };

  // Wait for the final image itself; if it fails there is nothing to render.
  try {
    await (img.complete && img.naturalWidth ? Promise.resolve() : new Promise((r, j) => {
      img.addEventListener("load", r, { once: true });
      img.addEventListener("error", j, { once: true });
    }));
  } catch {
    done();
    return;
  }

  if (reducedMotion) {
    done();
    return;
  }

  const under = underSrc ? await loadImage(underSrc).catch(() => null) : null;

  // Size the canvas to the frame in device pixels (capped at 2x).
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(frame.clientWidth * dpr);
  const hgt = Math.round(frame.clientHeight * dpr);
  canvas.width = w;
  canvas.height = hgt;
  const ctx = canvas.getContext("2d");
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#f26b38";

  // Base layer: the wireframe pass, or a dark viewport grid.
  if (under) {
    const c = coverRect(under, w, hgt);
    ctx.drawImage(under, c.sx, c.sy, w * c.scale, hgt * c.scale, 0, 0, w, hgt);
    ctx.fillStyle = "rgba(10, 11, 13, 0.35)";
    ctx.fillRect(0, 0, w, hgt);
  } else {
    ctx.fillStyle = "#0a0b0d";
    ctx.fillRect(0, 0, w, hgt);
  }
  frame.classList.add("is-rendering");

  // Coarse sample: the final image shrunk to 1/22 size, drawn back up without smoothing.
  const cover = coverRect(img, w, hgt);
  const small = document.createElement("canvas");
  small.width = Math.max(8, Math.round(w / 22));
  small.height = Math.max(5, Math.round(hgt / 22));
  small.getContext("2d").drawImage(img, cover.sx, cover.sy, w * cover.scale, hgt * cover.scale, 0, 0, small.width, small.height);

  // Tile grid and a centre-out order with a little jitter.
  const cols = w / dpr > 900 ? 10 : w / dpr > 560 ? 8 : 5;
  const rows = Math.max(3, Math.round(cols * (hgt / w)));
  const tw = w / cols;
  const th = hgt / rows;
  const tiles = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const d = Math.hypot((x + 0.5) / cols - 0.5, ((y + 0.5) / rows - 0.5) * 0.8);
      tiles.push({ x: x * tw, y: y * th, key: d + Math.random() * 0.08 });
    }
  }
  tiles.sort((a, b) => a.key - b.key);

  const bracket = (t) => {
    const len = Math.min(tw, th) * 0.18;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, dpr);
    ctx.beginPath();
    const x0 = t.x + 1, y0 = t.y + 1, x1 = t.x + tw - 1, y1 = t.y + th - 1;
    ctx.moveTo(x0, y0 + len); ctx.lineTo(x0, y0); ctx.lineTo(x0 + len, y0);
    ctx.moveTo(x1 - len, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + len);
    ctx.moveTo(x1, y1 - len); ctx.lineTo(x1, y1); ctx.lineTo(x1 - len, y1);
    ctx.moveTo(x0 + len, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - len);
    ctx.stroke();
  };

  const sampleTile = (t) => {
    ctx.imageSmoothingEnabled = false;
    const sx = (t.x / w) * small.width;
    const sy = (t.y / hgt) * small.height;
    ctx.drawImage(small, sx, sy, (tw / w) * small.width, (th / hgt) * small.height, t.x, t.y, tw + 1, th + 1);
    bracket(t);
  };

  const finishTile = (t) => {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      img,
      cover.sx + t.x * cover.scale, cover.sy + t.y * cover.scale, (tw + 1) * cover.scale, (th + 1) * cover.scale,
      t.x, t.y, tw + 1, th + 1
    );
  };

  // Drive it off the clock so a slow frame never stalls the render.
  const start = performance.now();
  let sampled = 0;
  let finished = 0;
  await new Promise((resolve) => {
    function frameTick(now) {
      const t = now - start;
      while (sampled < tiles.length && sampled * TILE_STAGGER <= t) sampleTile(tiles[sampled++]);
      while (finished < tiles.length && finished * TILE_STAGGER + SAMPLE_MS <= t) finishTile(tiles[finished++]);
      if (readout) readout.textContent = `Rendering  ${String(finished).padStart(2, "0")}/${tiles.length}`;
      if (finished >= tiles.length) resolve();
      else requestAnimationFrame(frameTick);
    }
    requestAnimationFrame(frameTick);
  });

  if (readout) readout.textContent = "Done";
  frame.classList.add("is-rendered");
  canvas.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 900); // in case transitionend never fires
}
