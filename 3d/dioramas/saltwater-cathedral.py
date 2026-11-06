"""
Saltwater Cathedral diorama: the floating spire fragment hovering over a
plinth of still, flooded water, with drowned column stubs and a fallen arch.
A low sun behind the tower throws shafts through its lancets.
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
rnd = random.Random(11)

water = kit.mat("Floodwater", "#12303c", rough=0.03)
stone = kit.mat("DrownedStone", "#7d868e", rough=0.8)
dk.plinth(radius=2.1, height=0.4, top_mat=water)
dk.append_model("saltwater-cathedral", offset=(0, 0, 1.25))

# Drowned column stubs, a fallen arch, loose blocks
bm = bmesh.new()
for x, y, h in ((-1.35, 0.55, 0.55), (1.25, 0.9, 0.32), (-0.9, -1.25, 0.2), (1.5, -0.6, 0.75)):
    kit.cyl(bm, (x, y, h / 2 - 0.05), 0.11, h + 0.1, 10)
    kit.cyl(bm, (x, y, h - 0.02), 0.14, 0.05, 10)
arch = kit.arch_points(0.0, 0.9, 0.0, 1.0, n=6)
kit.tube(bm, [(0.55 + u * 0.8, -1.45 + u * 0.35, v * 0.8 - 0.25) for u, v in arch], 0.06, 6)
for _ in range(6):
    a, r = rnd.uniform(0, 2 * math.pi), rnd.uniform(1.0, 1.85)
    kit.box(bm, (math.cos(a) * r, math.sin(a) * r, 0.03), (0.16, 0.12, 0.1), rot=(rnd.uniform(-20, 20), rnd.uniform(-20, 20), rnd.uniform(0, 90)))
kit.obj("Ruins", bm, stone, flat=True)

# Two thin falls from the slab edge down to the water (atmosphere only)
falls = kit.mat("Fall", "#d6e2ea", rough=0.2, emission="#d6e2ea", strength=0.35)
falls.surface_render_method = "DITHERED"
nt = falls.node_tree
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Alpha"].default_value = 0.45
for x, y in ((0.82, -0.45), (-0.7, 0.62)):
    bm = bmesh.new()
    rows = [[bm.verts.new((x + k * 0.08, y, 1.28 - j * 0.11)) for k in range(3)] for j in range(12)]
    for ra, rb in zip(rows, rows[1:]):
        for k in range(2):
            bm.faces.new((ra[k], ra[k + 1], rb[k + 1], rb[k]))
    dk.tag(kit.obj("Fall", bm, falls, flat=True), "fx")

# Light: low warm sun behind the tower, cool rim and fill, fog for the shafts
dk.world("#6f8498", 0.12)
dk.spot("Sun", (0.6, 6.5, 2.6), (0, 0, 1.9), 9000, 16, "#ffd7a8", blend=0.4)
dk.sun("Sky", 60, 35, 1.2, "#ffe2c0", angle=3.0).data.volume_factor = 0.0
dk.area("Rim", (-4, 3, 4), (0, 0, 1.4), power=900, size=3, color="#b9c8d6")
dk.area("Fill", (3, -5, 2), (0, 0, 1.2), power=500, size=4, color="#9fb0c0")
dk.fog((0, -0.6, 1.8), 3.0, 0.16)

dk.camera("hero", (-5.4, -7.5, 2.7), (0, 0, 1.75), lens=40)
dk.camera("g1", (6.4, -7.2, 1.2), (0, 0, 1.45), lens=32)
dk.camera("g2", (-1.8, -3.0, 2.9), (0, 0, 2.1), lens=60)
dk.camera("g3", (2.0, -2.9, 0.18), (0, 0, 1.55), lens=26)
dk.run(target=(0, 0, 1.2))
