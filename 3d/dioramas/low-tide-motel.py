"""
Low Tide Motel diorama: the sign on a patch of wet tarmac between two storms,
with a kerb, road markings, puddles, a motel wall with lit doors and a
vending machine that still works. Rain streaks in the stills.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402

import diorama_kit as dk  # noqa: E402

kit = dk.kit
dk.start()
rnd = random.Random(14)

tarmac = kit.mat("Tarmac", "#1c1f23", rough=0.32)
dk.plinth(radius=1.9, height=0.32, top_mat=tarmac)
for ob in dk.append_model("low-tide-motel", offset=(0.35, -0.35, 0)):
    # the lettering on the back reads mirrored ("MOTOM") through the wireframe
    if ob.name.startswith("Text") and sum(v.co.y for v in ob.data.vertices) / len(ob.data.vertices) > -0.35:
        dk.tag(ob, "nowire")

concrete = kit.mat("Kerb", "#7c7a76", rough=0.85)
paint = kit.mat("RoadPaint", "#e9e2c8", rough=0.6)
puddle = kit.mat("Puddles", "#0f1418", rough=0.02)
wall = kit.mat("MotelWall", "#c9b9a6", rough=0.8)
trim = kit.mat("MotelTrim", "#3f6f73", rough=0.6)
window = kit.mat("MotelWindow", "#ffd9a8", rough=0.4, emission="#ffc98a", strength=2.5)
machine = kit.mat("Vending", "#8c2f3a", rough=0.45)
screen = kit.mat("VendingFront", "#eaf4ff", rough=0.3, emission="#dcecff", strength=3.0)

# Kerb and road markings
bm = bmesh.new()
kit.box(bm, (0, -0.95, 0.04), (3.4, 0.18, 0.08))
kit.obj("Kerb", bm, concrete, flat=True)
bm = bmesh.new()
for x in (-1.2, -0.4, 0.4, 1.2):
    kit.box(bm, (x, -1.45, 0.003), (0.5, 0.06, 0.004))
kit.obj("Markings", bm, paint, flat=True)
bm = bmesh.new()
for x, y, r in ((-0.9, -1.35, 0.32), (0.95, -1.3, 0.22), (-0.6, 0.15, 0.25)):
    kit.cyl(bm, (x, y, 0.004), r, 0.006, 18)
kit.obj("Puddles", bm, puddle)

# Motel wall behind: doors, lit windows, a roof edge
bm = bmesh.new()
kit.box(bm, (-0.3, 1.15, 0.55), (2.6, 0.22, 1.1))
kit.obj("Wall", bm, wall, flat=True)
bm = bmesh.new()
kit.box(bm, (-0.3, 1.12, 1.14), (2.8, 0.42, 0.08))
for x in (-1.2, -0.3, 0.6):
    kit.box(bm, (x, 1.03, 0.36), (0.3, 0.02, 0.62))
kit.obj("Doors", bm, trim, flat=True)
bm = bmesh.new()
for x in (-0.82, 0.08, 0.98):
    kit.box(bm, (x, 1.03, 0.62), (0.34, 0.02, 0.26))
kit.obj("Windows", bm, window, flat=True)

# The vending machine
bm = bmesh.new()
kit.box(bm, (-1.15, 0.65, 0.42), (0.42, 0.34, 0.84))
kit.obj("Vending", bm, machine, flat=True)
bm = bmesh.new()
kit.box(bm, (-1.15, 0.475, 0.5), (0.3, 0.012, 0.5))
kit.obj("VendingFront", bm, screen, flat=True)

# Rain streaks (stills only)
rain = kit.mat("Rain", "#9fb3c4", emission="#9fb3c4", strength=0.5)
bm = bmesh.new()
for _ in range(260):
    x, y, z = rnd.uniform(-2.2, 2.2), rnd.uniform(-2.0, 1.6), rnd.uniform(0.2, 2.8)
    kit.cyl(bm, (x, y, z), 0.0025, rnd.uniform(0.18, 0.32), 4, rot=(6, 4, 0))
dk.tag(kit.obj("Rain", bm, rain, flat=True), "fx")

# Light: neon, vending glow, warm windows, cool moonlight
dk.world("#4a5a78", 0.1)
dk.point("NeonGlow", (0.6, -0.42, 1.7), 40, "#ff6fa2", radius=0.25)
dk.point("Vending", (-1.15, 0.25, 0.55), 18, "#dcecff", radius=0.15)
dk.point("Windows", (0.0, 0.7, 0.65), 14, "#ffc98a", radius=0.6, shadow=False)
dk.area("Moon", (-3.5, 3.0, 4.5), (0, 0, 0.8), power=500, size=3, color="#8ea6c8")
dk.area("Fill", (3.5, -4, 1.5), (0, 0, 0.8), power=120, size=4, color="#8ea0b8")
dk.fog((0.3, -0.2, 1.2), 2.6, 0.08, color="#c7d0de")

dk.camera("hero", (2.9, -4.7, 1.35), (0.1, 0, 0.95), lens=45)
dk.camera("g1", (-4.0, -5.0, 1.1), (0, 0.1, 0.8), lens=32)
dk.camera("g2", (1.25, -1.8, 1.75), (0.55, -0.35, 1.7), lens=55)
dk.camera("g3", (1.0, -1.85, 0.06), (0.35, -0.2, 1.2), lens=22)
dk.run(target=(0, 0, 0.8))
