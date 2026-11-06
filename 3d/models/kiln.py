"""
Kiln: a brick bottle kiln with a glowing firing door, and a potter's wheel
beside it with a vase still on the wheel head.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402

import model_kit as kit  # noqa: E402

kit.start()

brick = kit.mat("Brick", "#a85a3c", rough=0.85)
band = kit.mat("IronBand", "#3a3533", rough=0.45, metal=0.8)
ember = kit.mat("Ember", "#ffb070", rough=0.6, emission="#ff9a4d", strength=4.0)
wood = kit.mat("Wood", "#5a4130", rough=0.7)
wheel = kit.mat("Wheel", "#7b7f84", rough=0.4, metal=0.6)
clay = kit.mat("Clay", "#d9824b", rough=0.5)

# Bottle kiln: a lathe profile (base drum -> shoulder -> neck -> chimney lip)
KX = -0.35
bm = bmesh.new()
kit.lathe(bm, [(0.62, 0.0), (0.64, 0.42), (0.6, 0.55), (0.48, 0.85), (0.3, 1.15),
               (0.2, 1.42), (0.2, 1.62), (0.24, 1.66), (0.24, 1.72), (0.17, 1.72), (0.17, 1.5)],
          segs=16, center=(KX, 0, 0))
kit.obj("Kiln", bm, brick)
bm = bmesh.new()
for z, r in ((0.2, 0.655), (0.4, 0.66)):
    kit.lathe(bm, [(r, z - 0.02), (r, z + 0.02)], segs=16, center=(KX, 0, 0))
kit.obj("Bands", bm, band)

# Firing door: an arched glowing opening set into the drum, facing +Y/+X
bm = bmesh.new()
ang = math.radians(-60)
dx, dy = math.cos(ang), math.sin(ang)
pts = [(-0.13, 0.0), (0.13, 0.0), (0.13, 0.2)] + [(0.13 * math.cos(t), 0.2 + 0.13 * math.sin(t)) for t in
                                                    [math.pi * k / 6 for k in range(1, 6)]] + [(-0.13, 0.2)]
cx, cy = KX + dx * 0.6, dy * 0.6
tx, ty = -dy, dx
kit.prism(bm, pts, 0.0, 0.07, to3d=lambda u, v, w: (cx + tx * u + dx * w, cy + ty * u + dy * w, 0.04 + v))
kit.obj("Door", bm, ember, flat=True)

# Potter's wheel: a little platform, a pedestal, the wheel head, a vase on it
WX, WY = 0.62, 0.18
bm = bmesh.new()
kit.box(bm, (WX, WY, 0.06), (0.62, 0.62, 0.12))
kit.obj("Platform", bm, wood, flat=True)
bm = bmesh.new()
kit.cyl(bm, (WX, WY, 0.3), 0.06, 0.36, 10)
kit.cyl(bm, (WX, WY, 0.5), 0.24, 0.05, 20)
kit.obj("WheelHead", bm, wheel)
bm = bmesh.new()
kit.lathe(bm, [(0.0, 0.525), (0.08, 0.525), (0.12, 0.6), (0.135, 0.68), (0.1, 0.78), (0.06, 0.84),
               (0.075, 0.9), (0.06, 0.9), (0.05, 0.84), (0.0, 0.62)], segs=18, center=(WX, WY, 0))
kit.obj("Vase", bm, clay)

kit.finish()
