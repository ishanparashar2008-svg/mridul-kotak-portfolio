"""
Paper Tigers diorama: the origami tiger striding across a folded-paper
hillock with paper trees and grass, lit like a bright commercial set.
(No turntable model for this project, as before.)
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
rnd = random.Random(21)

paper = kit.mat("Sheet", "#efe6d2", rough=0.8)
green = kit.mat("PaperGreen", "#a9bf86", rough=0.8)
green2 = kit.mat("PaperGreenDark", "#7f9a63", rough=0.8)
dk.plinth(radius=1.9, height=0.3, side_mat=kit.mat("PlinthPaper", "#d8cdb6", rough=0.85))

# Folded ground: a fan of flat facets with gentle creases
bm_a, bm_b = bmesh.new(), bmesh.new()
n, rings = 18, (0.0, 0.7, 1.3, 1.82)
height = {0: 0.1}
pts = []
for ri, r in enumerate(rings):
    ring = []
    for i in range(1 if r == 0 else n):
        a = 2 * math.pi * (i + 0.5 * (ri % 2)) / n
        z = 0.1 if r == 0 else max(0.0, 0.08 - 0.03 * ri + rnd.uniform(-0.03, 0.05)) if ri < 3 else 0.004
        ring.append((math.cos(a) * r, math.sin(a) * r, z))
    pts.append(ring)
for ri in range(len(rings) - 1):
    inner, outer = pts[ri], pts[ri + 1]
    for i in range(n):
        o0, o1 = outer[i], outer[(i + 1) % n]
        if len(inner) == 1:
            tris = [(inner[0], o0, o1)]
        else:
            i0, i1 = inner[i], inner[(i + 1) % n]
            tris = [(i0, o0, o1), (i0, o1, i1)]
        for t in tris:
            kit.tri(bm_a if rnd.random() < 0.7 else bm_b, *t)
kit.obj("Ground", bm_a, paper, flat=True)
kit.obj("GroundGreen", bm_b, green, flat=True)
dk.append_model("paper-tigers", offset=(0.05, -0.1, 0.08), scale=1.0, rot=(0, 0, -8))

# Folded paper trees and grass
bm_l, bm_d = bmesh.new(), bmesh.new()
for x, y, h in ((-1.25, 0.75, 1.0), (-0.75, 1.15, 0.7), (1.2, 0.95, 0.85)):
    for tier in range(3):
        z = 0.15 + tier * h * 0.28
        r = 0.32 * (1 - tier * 0.25) * h
        top = (x, y, z + h * 0.42)
        for k in range(5):
            a0, a1 = 2 * math.pi * k / 5, 2 * math.pi * (k + 1) / 5
            kit.tri(bm_l if k % 2 else bm_d, (x + math.cos(a0) * r, y + math.sin(a0) * r, z), (x + math.cos(a1) * r, y + math.sin(a1) * r, z), top)
for _ in range(22):
    a, r = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.8, 1.7)
    x, y = math.cos(a) * r, math.sin(a) * r
    h = rnd.uniform(0.1, 0.22)
    kit.tri(bm_l, (x - 0.03, y, 0.03), (x + 0.03, y, 0.03), (x + rnd.uniform(-0.04, 0.04), y + 0.01, h))
kit.obj("TreesLight", bm_l, green, flat=True)
kit.obj("TreesDark", bm_d, green2, flat=True)

# Light: big warm key, soft fill, crisp rim — a bright product set in the void
dk.world("#e8e1d4", 0.15)
dk.area("Key", (-2.5, -3.2, 4.0), (0, 0, 0.5), power=750, size=3.5, color="#fff1dc")
dk.area("Fill", (3.2, -2.5, 1.5), (0, 0, 0.5), power=220, size=4.0, color="#e9eef6")
dk.area("Rim", (1.0, 3.5, 2.5), (0, 0, 0.6), power=900, size=2.0, color="#ffffff")

dk.camera("hero", (3.1, -5.4, 1.75), (-0.05, 0, 0.5), lens=45)
dk.camera("g1", (-3.4, -4.6, 1.9), (0, 0, 0.4), lens=34)
dk.camera("g2", (1.65, -1.25, 1.0), (0.72, -0.08, 0.78), lens=60)
dk.camera("g3", (0.95, -1.75, 0.12), (0, 0, 0.6), lens=24)
dk.run(target=(0, 0, 0.5))
