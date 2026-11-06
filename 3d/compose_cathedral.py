"""
Stitch the four Saltwater Cathedral passes into one scroll sequence.

Every frame starts as the wireframe; each later pass then takes over the
one before it in bucket tiles, spiralling out from the centre like a Cycles
render (and like the site's loader). Scrolling back un-renders it.

    python 3d/compose_cathedral.py                      # both framings -> website/assets/seq/cathedral/
    python 3d/compose_cathedral.py --frames 1,32,60     # preview frames as PNG -> 3d/cathedral/preview/

Input:  3d/cathedral/render/<framing>/<pass>/frame_NNNN.png (NNNN = frame number), plus
        <framing>/specks/: the void's star specks on black, added on top of every
        frame so the void never changes through a tile hand-off.
Output: frame_NNNN.webp + manifest.json per framing. The manifest also carries
        the pass schedule and tile grid, so the page's readouts (pass name,
        tile count) are driven by the same numbers as the pictures.
Needs Pillow and numpy (pip install pillow numpy).
"""

import argparse
import json
import math
import os
import random

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, "..", "website")

FRAMES = 120
PASSES = ["wire", "clay", "lit", "final"]
# (from, to, outgoing pass, incoming pass) as fractions of the scroll
TRANSITIONS = [(0.22, 0.30, "wire", "clay"), (0.45, 0.53, "clay", "lit"), (0.68, 0.76, "lit", "final")]

FRAMINGS = {
    # tile grid ~100 px buckets; WebP quality per framing
    "desktop": dict(cols=16, rows=9, quality=80, bracket=14, line=2),
    "mobile": dict(cols=8, rows=14, quality=76, bracket=10, line=2),
}
BRACKET = np.array([236, 235, 230], dtype=np.float32)   # tokens.css --fg (never the accent)
ACTIVE_SHARE = 1 / 22    # share of the tiles "sampling" at any moment


def progress(frame):
    return (frame - 1) / (FRAMES - 1)


def layers(t):
    """(base pass, incoming pass or None, 0..1 through the transition)."""
    for a, b, src, dst in TRANSITIONS:
        if t < a:
            return src, None, 0.0
        if t < b:
            return src, dst, (t - a) / (b - a)
    return PASSES[-1], None, 0.0


def tile_boxes(w, h, cols, rows):
    xs = [round(w * i / cols) for i in range(cols + 1)]
    ys = [round(h * j / rows) for j in range(rows + 1)]
    return [(xs[i], ys[j], xs[i + 1], ys[j + 1]) for j in range(rows) for i in range(cols)]


def tile_order(cols, rows, seed):
    """Spiral out from the centre with a little shuffle (same idea as js/loader.js)."""
    rnd = random.Random(seed)
    cx, cy = (cols - 1) / 2, (rows - 1) / 2
    keyed = []
    for j in range(rows):
        for i in range(cols):
            d = math.hypot((i - cx) / cols, (j - cy) / rows)
            keyed.append((d + rnd.random() * 0.12, j * cols + i))
    return [k for _, k in sorted(keyed)]


def draw_brackets(img, box, length, line):
    x0, y0, x1, y1 = box
    a = 0.75
    for (x, y, dx, dy) in ((x0, y0, 1, 1), (x1 - 1, y0, -1, 1), (x0, y1 - 1, 1, -1), (x1 - 1, y1 - 1, -1, -1)):
        xs = sorted((x, x + dx * length))
        ys = sorted((y, y + dy * line))
        img[ys[0]:ys[1] + 1, xs[0]:xs[1] + 1] = img[ys[0]:ys[1] + 1, xs[0]:xs[1] + 1] * (1 - a) + BRACKET * a
        xs = sorted((x, x + dx * line))
        ys = sorted((y, y + dy * length))
        img[ys[0]:ys[1] + 1, xs[0]:xs[1] + 1] = img[ys[0]:ys[1] + 1, xs[0]:xs[1] + 1] * (1 - a) + BRACKET * a


def compose(frame, framing, src):
    spec = FRAMINGS[framing]
    t = progress(frame)
    base, incoming, u = layers(t)

    def load(p):
        return np.asarray(Image.open(os.path.join(src, framing, p, f"frame_{frame:04d}.png")).convert("RGB"),
                          dtype=np.float32)

    specks_path = os.path.join(src, framing, "specks", f"frame_{frame:04d}.png")
    specks = load("specks") if os.path.exists(specks_path) else 0

    out = load(base)
    if incoming is None:
        return np.clip(out + specks, 0, 255).astype(np.uint8)
    nxt = load(incoming)
    h, w = out.shape[:2]
    boxes = tile_boxes(w, h, spec["cols"], spec["rows"])
    seed = [tr[3] for tr in TRANSITIONS].index(incoming)
    order = tile_order(spec["cols"], spec["rows"], seed)
    n = len(order)
    done = int(u * n)
    active = max(2, round(n * ACTIVE_SHARE))
    rnd = np.random.default_rng(frame)
    for k, idx in enumerate(order[:min(n, done + active)]):
        x0, y0, x1, y1 = boxes[idx]
        if k < done:
            out[y0:y1, x0:x1] = nxt[y0:y1, x0:x1]
            continue
        # a bucket mid-render: the new pass arrives as sparse, noisy samples
        cover = 0.25 + 0.6 * (1 - (k - done) / active)
        mask = rnd.random((y1 - y0, x1 - x0, 1)) < cover
        grain = 1 + rnd.normal(0, 0.18, (y1 - y0, x1 - x0, 1))
        region = np.where(mask, nxt[y0:y1, x0:x1] * grain, out[y0:y1, x0:x1] * 0.45)
        out[y0:y1, x0:x1] = np.clip(region, 0, 255)
        draw_brackets(out, boxes[idx], spec["bracket"], spec["line"])
    return np.clip(out + specks, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.path.join(HERE, "cathedral", "render"))
    ap.add_argument("--out", default=os.path.join(SITE, "assets", "seq", "cathedral"))
    ap.add_argument("--framing", default="desktop,mobile")
    ap.add_argument("--frames", help="comma list: write these as PNG previews instead of the full sequence")
    ap.add_argument("--preview-out", default=os.path.join(HERE, "cathedral", "preview"))
    a = ap.parse_args()

    for framing in a.framing.split(","):
        if a.frames:
            os.makedirs(a.preview_out, exist_ok=True)
            for f in (int(v) for v in a.frames.split(",")):
                path = os.path.join(a.preview_out, f"{framing}_composite_{f:04d}.png")
                Image.fromarray(compose(f, framing, a.src)).save(path)
                print(f"[compose] {path}  ({layers(progress(f))})")
            continue
        out = os.path.join(a.out, framing)
        os.makedirs(out, exist_ok=True)
        total = 0
        for f in range(1, FRAMES + 1):
            path = os.path.join(out, f"frame_{f:04d}.webp")
            Image.fromarray(compose(f, framing, a.src)).save(path, "WEBP", quality=FRAMINGS[framing]["quality"], method=6)
            total += os.path.getsize(path)
            if f % 20 == 0:
                print(f"[compose] {framing} {f}/{FRAMES}", flush=True)
        h, w = compose(1, framing, a.src).shape[:2]
        manifest = {
            "count": FRAMES, "width": w, "height": h, "format": "webp", "prefix": "frame_", "pad": 4,
            "ext": ".webp", "fps": 30, "frames": [1, FRAMES, 1], "transparent": False, "bytes": total,
            "passes": PASSES,
            "transitions": [list(tr) for tr in TRANSITIONS],
            "tiles": {"cols": FRAMINGS[framing]["cols"], "rows": FRAMINGS[framing]["rows"]},
        }
        with open(os.path.join(out, "manifest.json"), "w") as fh:
            json.dump(manifest, fh, indent=2)
        print(f"[compose] {framing}: {FRAMES} frames, {total / 1024 / 1024:.1f} MB ({total / FRAMES / 1024:.0f} KB avg)")


if __name__ == "__main__":
    main()
