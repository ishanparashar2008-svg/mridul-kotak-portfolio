"""
Kiln diorama: the bottle kiln and wheel on a brick yard at dusk, with stacked
pots, a woodpile and a stool. The firing door glows and lights the bricks.
"""

import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import bmesh  # noqa: E402
import bpy  # noqa: E402

import diorama_kit as dk  # noqa: E402

kit = dk.kit
dk.start()
rnd = random.Random(5)


def brick_floor():
    """Herringbone-ish brick yard: brick texture across X/Y."""
    m = bpy.data.materials.new("BrickYard")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.inputs["Scale"].default_value = 5.0
    brick.inputs["Color1"].default_value = (*kit.hex_color("#7a3f2c"), 1)
    brick.inputs["Color2"].default_value = (*kit.hex_color("#5c2f22"), 1)
    brick.inputs["Mortar"].default_value = (*kit.hex_color("#3a332e"), 1)
    brick.inputs["Mortar Size"].default_value = 0.02
    nt.links.new(geo.outputs["Position"], brick.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    m.diffuse_color = (*kit.hex_color("#6b3727"), 1)   # flat colour for the turntable GLB
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.3
    nt.links.new(brick.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m


dk.plinth(radius=2.0, height=0.35, top_mat=brick_floor())
dk.append_model("kiln", offset=(0.15, 0.1, 0))

clay = kit.mat("Pots", "#c98a5e", rough=0.55)
glaze = kit.mat("Glaze", "#3d5a64", rough=0.25)
wood = kit.mat("Logs", "#6a4a33", rough=0.8)
bark = kit.mat("Stool", "#4a3426", rough=0.7)

# Stacked pots by the kiln
bm = bmesh.new()
for x, y, z, s in ((-1.3, -0.75, 0, 1.0), (-1.1, -1.05, 0, 0.8), (-1.2, -0.88, 0.32, 0.75)):
    kit.lathe(bm, [(0.0, 0.0), (0.12 * s, 0.0), (0.17 * s, 0.12 * s), (0.15 * s, 0.26 * s), (0.11 * s, 0.32 * s), (0.0, 0.25 * s)],
              segs=14, center=(x, y, z))
kit.obj("Pots", bm, clay)
bm = bmesh.new()
kit.lathe(bm, [(0.0, 0.0), (0.09, 0.0), (0.16, 0.08), (0.17, 0.16), (0.0, 0.1)], segs=14, center=(1.25, -0.7, 0))
kit.obj("Bowl", bm, glaze)

# Woodpile behind the kiln, and a stool at the wheel
bm = bmesh.new()
for row in range(3):
    for k in range(4 - row):
        kit.cyl(bm, (-1.0 + k * 0.15 + row * 0.075, 1.1, 0.07 + row * 0.13), 0.065, 0.7, 8, rot=(90, 0, 18))
kit.obj("Woodpile", bm, wood)
bm = bmesh.new()
kit.cyl(bm, (1.25, 0.45, 0.32), 0.16, 0.05, 12)
for a in (0, 120, 240):
    r = math.radians(a)
    kit.cyl(bm, (1.25 + math.cos(r) * 0.1, 0.45 + math.sin(r) * 0.1, 0.15), 0.02, 0.32, 6)
kit.obj("Stool", bm, bark)

# Sparks drifting up from the chimney (atmosphere only)
sparks = kit.mat("Sparks", "#ffc890", emission="#ffa860", strength=12.0)
bm = bmesh.new()
for _ in range(26):
    kit.ico(bm, (-0.2 + rnd.gauss(0, 0.12), 0.1 + rnd.gauss(0, 0.12), 1.85 + rnd.uniform(0, 0.9)), rnd.uniform(0.006, 0.012), 0)
dk.tag(kit.obj("Sparks", bm, sparks, flat=True), "fx")

# Light: ember glow from the door, low dusk sun, cool rim
dk.world("#7d8aa0", 0.12)
door = (-0.2 + 0.5 * 0.75, 0.1 - 0.87 * 0.75, 0.2)
dk.point("Ember", door, 70, "#ff8a3d", radius=0.1)
dk.point("EmberInside", (-0.2, 0.1, 0.3), 40, "#ff8a3d", radius=0.2, shadow=False)
dk.sun("Dusk", -25, 14, 3.0, "#ffb37a", angle=2.0)
dk.area("Rim", (-3, 4, 3.5), (0, 0, 0.8), power=700, size=3, color="#8fa6c0")
dk.area("Fill", (3, -4, 2), (0, 0, 0.6), power=180, size=4, color="#a9b6c6")
dk.fog((0, 0, 1.0), 2.6, 0.05, color="#e0d2c4")

dk.camera("hero", (3.2, -5.2, 2.1), (0.05, 0, 0.75), lens=45)
dk.camera("g1", (0.4, -6.8, 1.5), (0, 0, 0.6), lens=34)
dk.camera("g2", (2.05, -0.45, 1.05), (0.77, 0.28, 0.72), lens=55)
dk.camera("g3", (0.85, -2.1, 0.12), (-0.2, 0.1, 1.0), lens=24)
dk.run(target=(0, 0, 0.7))
