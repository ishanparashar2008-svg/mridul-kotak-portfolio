"""
Orbital Nursery: a small ring station. Habitat ring with lit windows, four
spokes, a hub and a geodesic greenhouse dome full of little trees.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402
from mathutils import Vector  # noqa: E402

import model_kit as kit  # noqa: E402

kit.start()

hull = kit.mat("Hull", "#c9ccd0", rough=0.35, metal=0.7)
dark = kit.mat("Panel", "#3b4148", rough=0.4, metal=0.6)
window = kit.mat("Window", "#cfe8c0", rough=0.3, emission="#b8e3a0", strength=2.5)
glass = kit.mat("DomeFrame", "#e3e6ea", rough=0.25, metal=0.9)
leaf = kit.mat("Leaf", "#8fc27a", rough=0.7)

R, TILT = 1.0, 0.0
# Habitat ring: a squashed octagonal tube
bm = bmesh.new()
pts = [(R * math.cos(2 * math.pi * i / 32), R * math.sin(2 * math.pi * i / 32), 0) for i in range(32)]
kit.tube(bm, pts, 0.11, sides=8, closed=True)
kit.obj("Ring", bm, hull)
bm = bmesh.new()
for i in range(16):
    a = 2 * math.pi * (i + 0.5) / 16
    kit.box(bm, (math.cos(a) * (R + 0.105), math.sin(a) * (R + 0.105), 0), (0.03, 0.12, 0.05), rot=(0, 0, math.degrees(a)))
kit.obj("Windows", bm, window, flat=True)

# Spokes and hub
bm = bmesh.new()
for i in range(4):
    a = 2 * math.pi * i / 4 + math.pi / 4
    kit.tube(bm, [(math.cos(a) * 0.2, math.sin(a) * 0.2, 0), (math.cos(a) * (R - 0.1), math.sin(a) * (R - 0.1), 0)], 0.025, 6)
kit.cyl(bm, (0, 0, 0), 0.2, 0.18, 12)
kit.cyl(bm, (0, 0, -0.16), 0.12, 0.16, 12, r2=0.05)          # docking spike underneath
kit.obj("Hub", bm, dark)

# Two little solar wings off the hub's underside
bm = bmesh.new()
for s in (-1, 1):
    kit.box(bm, (s * 0.42, 0, -0.26), (0.5, 0.18, 0.012))
kit.tube(bm, [(-0.17, 0, -0.26), (0.17, 0, -0.26)], 0.012, 6)
kit.obj("Solar", bm, dark, flat=True)

# Greenhouse dome: the struts of a half icosphere, with trees inside
src = bmesh.new()
bmesh.ops.create_icosphere(src, subdivisions=1, radius=0.3)
bm = bmesh.new()
for e in src.edges:
    a, b = e.verts[0].co, e.verts[1].co
    if a.z >= -0.01 and b.z >= -0.01:
        kit.tube(bm, [Vector((a.x, a.y, a.z + 0.09)), Vector((b.x, b.y, b.z + 0.09))], 0.008, 4)
src.free()
kit.obj("Dome", bm, glass, flat=True)
bm = bmesh.new()
for x, y, h in ((0, 0, 0.26), (0.12, 0.06, 0.18), (-0.1, 0.1, 0.16), (0.02, -0.14, 0.2), (-0.12, -0.08, 0.14)):
    kit.cyl(bm, (x, y, 0.09 + h / 2), 0.07, h, 6, r2=0.0)
kit.obj("Trees", bm, leaf, flat=True)

kit.finish()
