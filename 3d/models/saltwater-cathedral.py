"""
Saltwater Cathedral: a broken gothic spire on a floating, flooded slab
(the same fragment idea as the scroll sequence, at object scale).
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import model_kit as kit  # noqa: E402

kit.start()
rnd = random.Random(3)

stone = kit.mat("Stone", "#8a939b", rough=0.8)
slate = kit.mat("Slate", "#56636d", rough=0.55)
rock = kit.mat("Rock", "#4c545b", rough=0.9)
water = kit.mat("Water", "#1f4a5e", rough=0.05)

# Slab: broken octagon-ish rim, sunk floor, rocky underside
n = 16
out = []
for i in range(n):
    a = 2 * math.pi * i / n
    r = 1.05 * (1 + rnd.uniform(-0.1, 0.05))
    out.append(Vector((math.cos(a) * r, math.sin(a) * r * 0.9, 0)))
bm = bmesh.new()
rim = [bm.verts.new((p.x, p.y, 0.06)) for p in out]
edge = [bm.verts.new((p.x, p.y, -0.12)) for p in out]
mid = [bm.verts.new((p.x * 0.75, p.y * 0.75, -0.45 + rnd.uniform(-0.05, 0.05))) for p in out]
low = [bm.verts.new((p.x * 0.38, p.y * 0.38, -0.78 + rnd.uniform(-0.06, 0.06))) for p in out]
tip = bm.verts.new((0.05, -0.04, -1.0))
for ra, rb in ((rim, edge), (edge, mid), (mid, low)):
    for i in range(n):
        bm.faces.new((ra[(i + 1) % n], ra[i], rb[i], rb[(i + 1) % n]))
for i in range(n):
    bm.faces.new((low[(i + 1) % n], low[i], tip))
inner = [bm.verts.new((p.x * 0.9, p.y * 0.9, 0.06)) for p in out]
floor = [bm.verts.new((p.x * 0.9, p.y * 0.9, -0.04)) for p in out]
for i in range(n):
    bm.faces.new((rim[i], rim[(i + 1) % n], inner[(i + 1) % n], inner[i]))
    bm.faces.new((inner[i], inner[(i + 1) % n], floor[(i + 1) % n], floor[i]))
bm.faces.new(floor)
kit.obj("Slab", bm, rock, flat=True)

bm = bmesh.new()
bm.faces.new([bm.verts.new((p.x * 0.9, p.y * 0.9, 0.02)) for p in out])
kit.obj("Water", bm, water, flat=True)

# Tower: four walls, each with a lancet, on a plinth
H0, H1, S, T = 0.0, 1.2, 0.36, 0.08
lancet = dict(c=0.0, w=0.3, sill=0.25, spring=0.75, ratio=1.4)
faces = [
    lambda u, v: (u, -S, v), lambda u, v: (u, S, v),
    lambda u, v: (-S, u, v), lambda u, v: (S, u, v),
]
for i, f in enumerate(faces):
    kit.wall_with_lancet(f"Wall{i}", -S - T / 2, S + T / 2, H0, H1, lancet, f, T, stone)
bm = bmesh.new()
kit.box(bm, (0, 0, H1 + 0.04), (2 * S + 0.16, 2 * S + 0.16, 0.08))     # cornice
for sx in (-1, 1):
    for sy in (-1, 1):
        kit.box(bm, (sx * S, sy * S, 0.6), (0.14, 0.14, 1.2))           # corner buttresses
        if (sx, sy) != (1, 1):                                          # one pinnacle has fallen
            kit.cyl(bm, (sx * S, sy * S, H1 + 0.22), 0.06, 0.28, 6)
            kit.cyl(bm, (sx * S, sy * S, H1 + 0.5), 0.07, 0.3, 6, r2=0.0)
kit.box(bm, (0.62, 0.3, 0.06), (0.12, 0.12, 0.3), rot=(70, 10, 30))     # ...and lies in the water
kit.obj("Masonry", bm, stone, flat=True)

# Octagonal spire, snapped near the top
bm = bmesh.new()
kit.cyl(bm, (0, 0, H1 + 0.2), 0.3, 0.32, 8)
kit.cyl(bm, (0, 0, H1 + 0.36 + 0.5), 0.27, 1.0, 8, r2=0.07)
kit.cyl(bm, (0.04, 0.0, H1 + 1.42), 0.065, 0.12, 8, r2=0.05, rot=(0, 14, 0))
kit.obj("Spire", bm, slate, flat=True)

kit.finish()
