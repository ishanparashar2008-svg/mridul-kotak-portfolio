"""
Low Tide Motel: a roadside motel sign on a post. Arrow-shaped board,
pink neon MOTEL lettering and outline, a VACANCY box, a puddle at the foot.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402

import model_kit as kit  # noqa: E402

kit.start()

metal = kit.mat("Post", "#5b6066", rough=0.45, metal=0.8)
board = kit.mat("Board", "#20262d", rough=0.5)
paint = kit.mat("BoardEdge", "#e7e1d6", rough=0.6)
neon = kit.mat("Neon", "#ffd0e0", rough=0.4, emission="#d46a8f", strength=6.0)
vacancy = kit.mat("Vacancy", "#c8f0ea", rough=0.4, emission="#6fd6c8", strength=3.0)
concrete = kit.mat("Concrete", "#8d8a85", rough=0.9)
puddle = kit.mat("Puddle", "#141a20", rough=0.04)

# Foot: concrete block and a puddle
bm = bmesh.new()
kit.cyl(bm, (0, 0, 0.06), 0.16, 0.12, 8)
kit.obj("Foot", bm, concrete, flat=True)
bm = bmesh.new()
kit.cyl(bm, (0.12, 0.08, 0.004), 0.42, 0.008, 16)
kit.obj("Puddle", bm, puddle)

# Post with a little cross-arm under the board
bm = bmesh.new()
kit.cyl(bm, (0, 0, 0.95), 0.05, 1.8, 10)
kit.box(bm, (0.18, 0, 1.36), (0.5, 0.06, 0.05))
kit.obj("Post", bm, metal)

# Arrow board standing in the XZ plane (faces -Y and +Y)
arrow = [(-0.35, 1.42), (0.62, 1.42), (0.88, 1.7), (0.62, 1.98), (-0.35, 1.98)]
inset = [(-0.31, 1.46), (0.6, 1.46), (0.83, 1.7), (0.6, 1.94), (-0.31, 1.94)]
xz = lambda x, z, y: (x, y, z)  # noqa: E731
bm = bmesh.new()
kit.prism(bm, arrow, -0.04, 0.04, to3d=xz)
kit.obj("BoardEdge", bm, paint, flat=True)
bm = bmesh.new()
kit.prism(bm, inset, -0.05, 0.05, to3d=xz)
kit.obj("Board", bm, board, flat=True)

# Neon: outline tube following the board, and the lettering on both faces
bm = bmesh.new()
loop = [(-0.27, 1.5), (0.58, 1.5), (0.78, 1.7), (0.58, 1.9), (-0.27, 1.9)]
for y in (-0.065, 0.065):
    kit.tube(bm, [(x, y, z) for x, z in loop], 0.012, 5, closed=True)
kit.obj("NeonOutline", bm, neon)
kit.text("MOTEL", 0.24, 0.012, neon, (0.2, -0.06, 1.7), rotation=(90, 0, 0))
kit.text("MOTEL", 0.24, 0.012, neon, (0.2, 0.06, 1.7), rotation=(90, 0, 180))

# VACANCY box hanging under the arm
bm = bmesh.new()
kit.box(bm, (0.24, 0, 1.22), (0.4, 0.07, 0.13))
kit.obj("VacancyBox", bm, board, flat=True)
bm = bmesh.new()
kit.box(bm, (0.24, 0, 1.22), (0.34, 0.08, 0.07))
kit.obj("VacancyLight", bm, vacancy, flat=True)
bm = bmesh.new()
for x in (0.1, 0.38):
    kit.box(bm, (x, 0, 1.31), (0.01, 0.01, 0.06))
kit.obj("Chains", bm, metal, flat=True)

kit.finish()
