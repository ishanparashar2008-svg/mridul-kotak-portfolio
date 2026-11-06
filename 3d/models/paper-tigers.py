"""
Paper Tigers: an origami tiger, all flat folded facets, standing mid-stride,
with dark stripe facets folded into the back.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402

import model_kit as kit  # noqa: E402

kit.start()

paper = kit.mat("Paper", "#e3b84f", rough=0.75)
fold = kit.mat("PaperShade", "#c99a35", rough=0.75)
stripe = kit.mat("Stripe", "#2b2219", rough=0.7)

# Key points (X along the body, head at +X; Z up)
P = {
    "rump": (-0.55, 0.0, 0.62), "back": (0.05, 0.0, 0.7), "neck": (0.42, 0.0, 0.72),
    "hipL": (-0.5, 0.2, 0.42), "hipR": (-0.5, -0.2, 0.42),
    "shL": (0.32, 0.2, 0.44), "shR": (0.32, -0.2, 0.44),
    "belly": (-0.1, 0.0, 0.34),
    "snout": (0.92, 0.0, 0.62), "jaw": (0.8, 0.0, 0.5), "brow": (0.62, 0.0, 0.92),
    "cheekL": (0.68, 0.17, 0.66), "cheekR": (0.68, -0.17, 0.66),
    "earL": (0.5, 0.17, 1.08), "earR": (0.5, -0.17, 1.08),
}


def f(bm, *names):
    kit.tri(bm, *[P[n] if isinstance(n, str) else n for n in names])


# Body: a folded paper box, two-tone so the folds read
top, side = bmesh.new(), bmesh.new()
for s, hip, sh in ((1, "hipL", "shL"), (-1, "hipR", "shR")):
    f(top, "rump", "back", hip)
    f(top, "back", sh, hip)
    f(top, "back", "neck", sh)
    f(side, hip, sh, "belly")
    f(side, "rump", hip, "belly")
    f(side, sh, "neck", "belly")
# Head: a faceted wedge with folded ears
for s, ck, ear in ((1, "cheekL", "earL"), (-1, "cheekR", "earR")):
    f(top, "neck", "brow", ck)
    f(top, "brow", "snout", ck)
    f(side, "snout", "jaw", ck)
    f(side, "jaw", "neck", ck)
    f(top, "brow", ear, ck)
    f(side, ear, "neck", ck)

# Legs: thin folded wedges, mid-stride
legs = [((0.32, 0.18, 0.44), (0.5, 0.17, 0.0)), ((0.32, -0.18, 0.44), (0.2, -0.17, 0.0)),
        ((-0.5, 0.18, 0.42), (-0.68, 0.17, 0.0)), ((-0.5, -0.18, 0.42), (-0.35, -0.17, 0.0))]
for (hx, hy, hz), (fx, fy, fz) in legs:
    a, b = (hx - 0.09, hy, hz), (hx + 0.09, hy, hz)
    knee = ((hx + fx) / 2, hy * 1.05, hz / 2)
    foot1, foot2 = (fx - 0.06, fy, fz), (fx + 0.07, fy, fz)
    f(side, a, b, knee)
    f(side, knee, foot1, foot2)
    f(top, a, knee, (hx, hy * 0.6, hz - 0.05))
    f(top, b, (hx, hy * 0.6, hz - 0.05), knee)

# Tail: a folded strip curling up
tail = [(-0.55, 0.0, 0.6), (-0.78, 0.0, 0.66), (-0.95, 0.0, 0.82), (-1.0, 0.0, 1.02), (-0.92, 0.0, 1.14)]
for (x0, y0, z0), (x1, y1, z1) in zip(tail, tail[1:]):
    f(top, (x0, 0.04, z0), (x1, 0.03, z1), (x0, -0.04, z0))
    f(side, (x1, 0.03, z1), (x1, -0.03, z1), (x0, -0.04, z0))
kit.obj("Folds", top, paper, flat=True)
kit.obj("Shade", side, fold, flat=True)

# Stripes: dark facets sitting just above the back
bm = bmesh.new()
for x in (-0.38, -0.18, 0.02, 0.22):
    for s in (1, -1):
        z = 0.66 + 0.04 * (x + 0.4)
        kit.tri(bm, (x, 0.0, z + 0.012), (x + 0.08, 0.0, z + 0.016), (x - 0.01, s * 0.17, z - 0.17))
kit.obj("Stripes", bm, stripe, flat=True)

kit.finish()
